import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { X, Layout, Plus, Grid2X2, Columns, Rows } from 'lucide-react';
import { apiUrl, authHeaders } from '../api';

const saveImageToDevice = async (imageData, fileName) => {
    if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
            path: fileName,
            data: imageData.split(',')[1],
            directory: Directory.Documents,
            recursive: true,
        });
        return;
    }

    const downloadLink = document.createElement('a');
    downloadLink.href = imageData;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
};

export default function Collage() {
    const navigate = useNavigate();
    const [images, setImages] = useState([]);
    const [layout, setLayout] = useState('grid'); // 'grid', 'v' (dọc), 'h' (ngang)
    const [isSaving, setIsSaving] = useState(false);
    const canvasRef = useRef(null);
    const fileInputRef = useRef(null);

    // Xử lý chọn nhiều ảnh
    const handleFileSelect = (event) => {
        const files = Array.from(event.target.files);
        if (files.length + images.length > 4) {
            alert('Chỉ được chọn tối đa 4 ảnh!');
            return;
        }

        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImages(prev => [...prev, reader.result]);
            };
            reader.readAsDataURL(file);
        });
        event.target.value = null;
    };

    // Xóa ảnh đã chọn
    const removeImage = (index) => {
        setImages(images.filter((_, i) => i !== index));
    };

    // Vẽ ảnh lên Canvas
    useEffect(() => {
        const drawToCanvas = async () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            
            // Đặt kích thước ảnh xuất ra là 1080x1080
            canvas.width = 1080;
            canvas.height = 1080;
            
            // Màu nền của viền ảnh ghép (khoảng trống)
            ctx.fillStyle = '#ffffff'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (images.length === 0) return;

            // Load tất cả ảnh
            const loadedImages = await Promise.all(images.map(src => {
                return new Promise(resolve => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.src = src;
                });
            }));

            // Thuật toán cắt ảnh lấp đầy khung (object-fit: cover)
            const drawCover = (img, dx, dy, dw, dh) => {
                const imgRatio = img.width / img.height;
                const ctxRatio = dw / dh;
                let sx, sy, sWidth, sHeight;
                if (imgRatio > ctxRatio) {
                    sHeight = img.height;
                    sWidth = img.height * ctxRatio;
                    sx = (img.width - sWidth) / 2;
                    sy = 0;
                } else {
                    sWidth = img.width;
                    sHeight = img.width / ctxRatio;
                    sx = 0;
                    sy = (img.height - sHeight) / 2;
                }
                ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dw, dh);
            };

            const gap = 15; // Khoảng cách giữa các ảnh
            const half = (1080 - gap) / 2;

            // Tùy theo số lượng ảnh và layout mà chia khung
            if (images.length === 1) {
                drawCover(loadedImages[0], 0, 0, 1080, 1080);
            } else if (images.length === 2) {
                if (layout === 'v') {
                    drawCover(loadedImages[0], 0, 0, half, 1080);
                    drawCover(loadedImages[1], half + gap, 0, half, 1080);
                } else {
                    drawCover(loadedImages[0], 0, 0, 1080, half);
                    drawCover(loadedImages[1], 0, half + gap, 1080, half);
                }
            } else if (images.length === 3) {
                drawCover(loadedImages[0], 0, 0, 1080, half);
                drawCover(loadedImages[1], 0, half + gap, half, half);
                drawCover(loadedImages[2], half + gap, half + gap, half, half);
            } else if (images.length === 4) {
                drawCover(loadedImages[0], 0, 0, half, half);
                drawCover(loadedImages[1], half + gap, 0, half, half);
                drawCover(loadedImages[2], 0, half + gap, half, half);
                drawCover(loadedImages[3], half + gap, half + gap, half, half);
            }
        };

        drawToCanvas();
    }, [images, layout]);

    // Lưu ảnh
    const handleSave = async () => {
        if (images.length === 0) return;
        setIsSaving(true);
        const finalImageData = canvasRef.current.toDataURL('image/jpeg', 0.95);
        const fileName = `ProCam_Collage_${Date.now()}.jpg`;

        try {
            await saveImageToDevice(finalImageData, fileName);
            const res = await fetch(apiUrl('/api/upload'), {
                method: 'POST',
                headers: authHeaders(true),
                body: JSON.stringify({ image: finalImageData, operation: 'collage' })
            });
            if (res.ok) {
                alert(Capacitor.isNativePlatform()
                    ? 'Đã lưu ảnh ghép vào thư mục Tài liệu trên điện thoại!'
                    : 'Xuất ảnh ghép thành công!');
                navigate('/');
            } else alert('Ảnh đã lưu trên thiết bị nhưng lỗi khi lưu lên server');
        } catch (error) {
            console.error(error);
            alert('Không thể lưu ảnh trên thiết bị hoặc kết nối Server');
        }
        setIsSaving(false);
    };

    return (
        <div className="bg-[#0a0a0c] text-white h-screen w-full flex flex-col font-sans selection:bg-[#ccff00] overflow-hidden">
            
            {/* Input ẩn để chọn nhiều file */}
            <input 
                type="file" multiple accept="image/*" 
                ref={fileInputRef} onChange={handleFileSelect} 
                className="hidden" 
            />

            <header className="flex justify-between items-center px-4 py-4 z-10 bg-[#121212]">
                <button onClick={() => navigate(-1)} className="p-1 active:scale-90 transition-transform">
                    <X size={24} className="text-white" />
                </button>
                <div className="font-bold text-sm">Ghép ảnh</div>
                <button onClick={handleSave} disabled={isSaving || images.length === 0} className="bg-[#ccff00] text-black text-[13px] font-bold px-4 py-1.5 rounded active:scale-95 transition-transform disabled:opacity-50">
                    {isSaving ? 'Đang xử lý...' : 'Lưu'}
                </button>
            </header>

            <main className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#000000] p-4">
                {/* Khung Canvas hiển thị kết quả */}
                <div className="w-full aspect-square bg-[#18181b] rounded-xl flex items-center justify-center overflow-hidden border border-white/10 shadow-lg relative">
                    {images.length === 0 ? (
                        <div className="flex flex-col items-center text-gray-500">
                            <Layout size={40} className="mb-2 opacity-50" />
                            <p className="text-sm font-medium">Chưa có ảnh nào</p>
                        </div>
                    ) : (
                        <canvas ref={canvasRef} className="w-full h-full object-contain" />
                    )}
                </div>
            </main>

            <section className="bg-[#0f0f0f] pt-4 pb-8 w-full shrink-0 border-t border-white/5">
                
                {/* Hàng chứa các ảnh đã chọn (Miniatures) */}
                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar px-5 mb-5">
                    <button 
                        onClick={() => fileInputRef.current.click()}
                        disabled={images.length >= 4}
                        className="w-16 h-16 shrink-0 bg-[#18181b] rounded-xl flex items-center justify-center border border-dashed border-white/20 text-gray-400 disabled:opacity-30 active:scale-95 transition-transform"
                    >
                        <Plus size={24} />
                    </button>
                    
                    {images.map((img, i) => (
                        <div key={i} className="w-16 h-16 shrink-0 relative rounded-xl overflow-hidden border border-white/10">
                            <img src={img} alt="thumnail" className="w-full h-full object-cover" />
                            <button onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 bg-black/50 rounded-full p-0.5">
                                <X size={12} className="text-white" />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Nút chọn Layout */}
                {images.length === 2 && (
                    <div className="flex justify-center gap-4">
                        <button onClick={() => setLayout('v')} className={`p-3 rounded-xl border ${layout === 'v' ? 'bg-[#ccff00]/10 border-[#ccff00] text-[#ccff00]' : 'bg-[#18181b] border-white/5 text-gray-400'}`}>
                            <Columns size={24} />
                        </button>
                        <button onClick={() => setLayout('h')} className={`p-3 rounded-xl border ${layout === 'h' ? 'bg-[#ccff00]/10 border-[#ccff00] text-[#ccff00]' : 'bg-[#18181b] border-white/5 text-gray-400'}`}>
                            <Rows size={24} />
                        </button>
                    </div>
                )}
                {images.length >= 3 && (
                    <div className="flex justify-center">
                        <div className="p-3 rounded-xl bg-[#ccff00]/10 border border-[#ccff00] text-[#ccff00]">
                            <Grid2X2 size={24} />
                        </div>
                    </div>
                )}
                
            </section>
        </div>
    );
}