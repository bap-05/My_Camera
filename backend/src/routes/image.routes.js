const express = require('express');
const { v2: cloudinary } = require('cloudinary');
const multer = require('multer');
const { ObjectId } = require('mongodb');
const { config } = require('../config/env');
const { requireAuth } = require('../middleware/auth');

cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
});

function createImageRouter(imageHistory, videoHistory) {
    const router = express.Router();
    const uploadVideo = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 100 * 1024 * 1024 },
    });

    function normalizeImageUrl(imageUrl, req) {
        if (typeof imageUrl !== 'string' || !imageUrl.trim()) return null;

        try {
            const url = new URL(imageUrl, `http://${req.get('host')}`);
            if (url.pathname.startsWith('/uploads/')) {
                return `${req.protocol}://${req.get('host')}${url.pathname}${url.search}`;
            }
            return url.toString();
        } catch {
            return null;
        }
    }

    router.post('/videos/upload', requireAuth, uploadVideo.single('video'), async (req, res) => {
        if (!req.file || !req.file.mimetype.startsWith('video/')) {
            return res.status(400).json({ success: false, message: 'Định dạng video không hợp lệ.' });
        }

        if (!videoHistory) {
            console.error('Collection video_history chưa được khởi tạo.');
            return res.status(503).json({ success: false, message: 'Dịch vụ lưu video chưa sẵn sàng.' });
        }

        try {
            const uploadResult = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream({
                    folder: 'camera-app/videos',
                    resource_type: 'video',
                    format: 'mp4',
                }, (error, result) => error ? reject(error) : resolve(result));
                stream.end(req.file.buffer);
            });

            const videoUrl = uploadResult.secure_url;
            await videoHistory.insertOne({
                userId: new ObjectId(req.user.sub),
                videoUrl,
                operation: 'video-edit',
                createdAt: new Date(),
            });

            return res.status(201).json({ success: true, videoUrl });
        } catch (error) {
            console.error('Lỗi upload video lên Cloudinary:', error);
            return res.status(500).json({ success: false, message: 'Không thể lưu video.' });
        }
    });

    router.post('/upload', requireAuth, async (req, res) => {
        const { image, operation = 'edit' } = req.body;
        if (typeof image !== 'string' || !image.startsWith('data:image/')) {
            return res.status(400).json({ success: false, message: 'Dữ liệu ảnh không hợp lệ.' });
        }

        if (!/^data:image\/[a-zA-Z0-9+.-]+;base64,[\s\S]+$/.test(image)) {
            return res.status(400).json({ success: false, message: 'Dữ liệu ảnh không hợp lệ.' });
        }

        try {
            const uploadResult = await cloudinary.uploader.upload(image, {
                folder: 'camera-app',
                resource_type: 'image',
            });

            const imageUrl = uploadResult.secure_url;

            await imageHistory.insertOne({
                userId: new ObjectId(req.user.sub),
                imageUrl,
                operation: typeof operation === 'string' ? operation : 'edit',
                createdAt: new Date(),
            });

            return res.status(201).json({ success: true, imageUrl });
        } catch (error) {
            console.error('Lỗi khi lưu ảnh:', error);
            return res.status(500).json({ success: false, message: 'Không thể lưu ảnh.' });
        }
    });

    router.get('/images', requireAuth, async (req, res) => {
        try {
            res.set('Cache-Control', 'no-store');
            const history = await imageHistory
                .find({ userId: new ObjectId(req.user.sub) })
                .sort({ createdAt: -1 })
                .limit(100)
                .project({ imageUrl: 1, operation: 1, createdAt: 1 })
                .toArray();
            return res.json(history
                .map((item) => ({
                    ...item,
                    id: item._id.toString(),
                    imageUrl: normalizeImageUrl(item.imageUrl, req),
                }))
                .filter((item) => item.imageUrl));
        } catch (error) {
            console.error('Lỗi đọc lịch sử ảnh:', error);
            return res.status(500).json({ success: false, message: 'Không thể tải lịch sử ảnh.' });
        }
    });

    router.get('/videos', requireAuth, async (req, res) => {
        if (!videoHistory) {
            return res.status(503).json({ success: false, message: 'Dịch vụ lịch sử video chưa sẵn sàng.' });
        }

        try {
            res.set('Cache-Control', 'no-store');
            const history = await videoHistory
                .find({ userId: new ObjectId(req.user.sub) })
                .sort({ createdAt: -1 })
                .limit(100)
                .project({ videoUrl: 1, operation: 1, createdAt: 1 })
                .toArray();

            return res.json(history
                .map((item) => ({
                    id: item._id.toString(),
                    videoUrl: `${req.protocol}://${req.get('host')}/api/videos/${item._id}/content`,
                    cloudinaryUrl: normalizeImageUrl(item.videoUrl, req),
                    operation: item.operation,
                    createdAt: item.createdAt,
                }))
                .filter((item) => item.cloudinaryUrl)
                .map(({ cloudinaryUrl, ...item }) => ({ ...item, posterSource: cloudinaryUrl })));
        } catch (error) {
            console.error('Lỗi đọc lịch sử video:', error);
            return res.status(500).json({ success: false, message: 'Không thể tải lịch sử video.' });
        }
    });

    async function deleteCloudinaryAsset(assetUrl, resourceType) {
        try {
            const url = new URL(assetUrl);
            const uploadMarker = `/${resourceType}/upload/`;
            const markerIndex = url.pathname.indexOf(uploadMarker);
            if (markerIndex < 0) return;

            const pathAfterUpload = url.pathname.slice(markerIndex + uploadMarker.length);
            const versionEnd = pathAfterUpload.indexOf('/');
            const publicIdWithExtension = versionEnd >= 0
                ? pathAfterUpload.slice(versionEnd + 1)
                : pathAfterUpload;
            const extensionIndex = publicIdWithExtension.lastIndexOf('.');
            const publicId = extensionIndex >= 0
                ? publicIdWithExtension.slice(0, extensionIndex)
                : publicIdWithExtension;

            await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        } catch (error) {
            console.warn(`Không thể xóa tài nguyên ${resourceType} trên Cloudinary:`, error);
        }
    }

    router.delete('/images/:id', requireAuth, async (req, res) => {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Mã ảnh không hợp lệ.' });
        }

        try {
            const result = await imageHistory.findOneAndDelete({
                _id: new ObjectId(req.params.id),
                userId: new ObjectId(req.user.sub),
            });
            if (!result) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy ảnh.' });
            }

            await deleteCloudinaryAsset(result.imageUrl, 'image');
            return res.json({ success: true });
        } catch (error) {
            console.error('Lỗi xóa lịch sử ảnh:', error);
            return res.status(500).json({ success: false, message: 'Không thể xóa lịch sử ảnh.' });
        }
    });

    router.delete('/videos/:id', requireAuth, async (req, res) => {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Mã video không hợp lệ.' });
        }
        if (!videoHistory) {
            return res.status(503).json({ success: false, message: 'Dịch vụ lịch sử video chưa sẵn sàng.' });
        }

        try {
            const result = await videoHistory.findOneAndDelete({
                _id: new ObjectId(req.params.id),
                userId: new ObjectId(req.user.sub),
            });
            if (!result) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy video.' });
            }

            await deleteCloudinaryAsset(result.videoUrl, 'video');
            return res.json({ success: true });
        } catch (error) {
            console.error('Lỗi xóa lịch sử video:', error);
            return res.status(500).json({ success: false, message: 'Không thể xóa lịch sử video.' });
        }
    });

    router.get('/videos/:id/content', requireAuth, async (req, res) => {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Mã video không hợp lệ.' });
        }

        try {
            const video = await videoHistory.findOne({
                _id: new ObjectId(req.params.id),
                userId: new ObjectId(req.user.sub),
            });
            if (!video || typeof video.videoUrl !== 'string') {
                return res.status(404).json({ success: false, message: 'Không tìm thấy video.' });
            }

            const headers = {};
            if (req.headers.range) headers.Range = req.headers.range;
            const videoResponse = await fetch(video.videoUrl, { headers });
            if (!videoResponse.ok || !videoResponse.body) {
                return res.status(502).json({ success: false, message: 'Không thể tải video từ Cloudinary.' });
            }

            res.status(videoResponse.status);
            res.set('Cache-Control', 'public, max-age=3600');
            res.set('Content-Type', videoResponse.headers.get('content-type') || 'video/mp4');
            for (const header of ['accept-ranges', 'content-range', 'content-length']) {
                const value = videoResponse.headers.get(header);
                if (value) res.set(header, value);
            }
            for await (const chunk of videoResponse.body) {
                res.write(Buffer.from(chunk));
            }
            return res.end();
        } catch (error) {
            console.error('Lỗi tải video lịch sử:', error);
            return res.status(500).json({ success: false, message: 'Không thể tải video lịch sử.' });
        }
    });

    router.get('/images/:id/content', requireAuth, async (req, res) => {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Mã ảnh không hợp lệ.' });
        }

        try {
            const image = await imageHistory.findOne({
                _id: new ObjectId(req.params.id),
                userId: new ObjectId(req.user.sub),
            });
            if (!image || typeof image.imageUrl !== 'string') {
                return res.status(404).json({ success: false, message: 'Không tìm thấy ảnh.' });
            }

            const imageResponse = await fetch(image.imageUrl);
            if (!imageResponse.ok || !imageResponse.body) {
                return res.status(502).json({ success: false, message: 'Không thể tải ảnh từ Cloudinary.' });
            }

            res.set('Cache-Control', 'public, max-age=3600');
            res.set('Content-Type', imageResponse.headers.get('content-type') || 'image/jpeg');
            for await (const chunk of imageResponse.body) {
                res.write(Buffer.from(chunk));
            }
            return res.end();
        } catch (error) {
            console.error('Lỗi tải ảnh lịch sử:', error);
            return res.status(500).json({ success: false, message: 'Không thể tải ảnh lịch sử.' });
        }
    });

    return router;
}

module.exports = { createImageRouter };
