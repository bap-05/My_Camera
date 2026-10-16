const path = require('path');
require('dotenv').config();

const mongodbUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;

if (!mongodbUri || !jwtSecret || !cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
    throw new Error(
        'Thiếu MONGODB_URI, JWT_SECRET hoặc thông tin Cloudinary trong file backend/.env'
    );
}

const config = {
    port: Number(process.env.PORT || 5000),
    mongodbUri,
    mongodbDb: process.env.MONGODB_DB || 'camera_app',
    jwtSecret,
    uploadDir: path.join(__dirname, '..', '..', 'uploads'),
    cloudinary: {
        cloudName: cloudinaryCloudName,
        apiKey: cloudinaryApiKey,
        apiSecret: cloudinaryApiSecret,
    },
};

module.exports = { config };
