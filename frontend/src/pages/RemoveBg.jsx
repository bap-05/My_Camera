import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { X, Scissors, Image as ImageIcon, Loader2, Check } from 'lucide-react';
import { apiUrl, authHeaders } from '../api';
import { removeBackground } from '@imgly/background-removal';

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

export default function RemoveBg() {
    const navigate = useNavigate();
    const [image, setImage] = useState(null);
    const [result, setResult] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef(null);

    // Chọn ảnh từ thiết bị
    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setImage(url);
            setResult(null); // Reset lại kết quả nếu chọn ảnh mới
        }
        event.target.value = null;
    };

    // Chạy AI Xóa Nền
    const handleRemoveBg = async () => {
        if (!image) return;
        setIsProcessing(true);
        try {
            // Gọi thư viện AI xử lý ảnh
            const blob = await removeBackground(image);
            const resultUrl = URL.createObjectURL(blob);
            setResult(resultUrl);
        } catch (error) {
            console.error(error);
            alert("Lỗi khi xử lý AI xóa nền!");
        }
        setIsProcessing(false);
    };

    // Lưu ảnh đã xóa nền (Định dạng PNG để giữ nền trong suốt)
    const handleSave = async () => {
        if (!result) return;
        setIsSaving(true);
        try {
            const resBlob = await fetch(result).then(r => r.blob());
            const base64data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(resBlob);
            });
            const fileName = `ProCam_RemoveBg_${Date.now()}.png`;

            await saveImageToDevice(base64data, fileName);
            const res = await fetch(apiUrl('/api/upload'), {
                method: 'POST',
                headers: authHeaders(true),
                body: JSON.stringify({ image: base64data, operation: 'remove-bg' })
            });

            if (res.ok) {
                alert(Capacitor.isNativePlatform()
                    ? 'Đã lưu ảnh vào thư mục Tài liệu trên điện thoại!'
                    : 'Lưu ảnh thành công!');
                navigate('/');
            } else {
                alert('Ảnh đã lưu trên thiết bị nhưng lỗi khi lưu lên server');
            }
        } catch (error) {
            console.error(error);
            alert('Không thể lưu ảnh trên thiết bị hoặc kết nối Server');
        }
        setIsSaving(false);
    };

    // Hình nền lưới Caro mờ (Checkerboard) để hiển thị nền trong suốt
    const checkerboardStyle = {
        backgroundImage: `
            linear-gradient(45deg, #1f1f1f 25%, transparent 25%, transparent 75%, #1f1f1f 75%, #1f1f1f),
            linear-gradient(45deg, #1f1f1f 25%, transparent 25%, transparent 75%, #1f1f1f 75%, #1f1f1f)
        `,
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0, 10px 10px'
    };

    return (
        <div className="bg-[#0a0a0c] text-white h-screen w-full flex flex-col font-sans selection:bg-[#ccff00] overflow-hidden">
            
            <input 
                type="file" accept="image/*" 
                ref={fileInputRef} onChange={handleFileSelect} 
                className="hidden" 
            />

            <header className="flex justify-between items-center px-4 py-4 z-10 bg-[#121212]">
                <button onClick={() => navigate(-1)} className="p-1 active:scale-90 transition-transform">
                    <X size={24} className="text-white" />
                </button>
                <div className="font-bold text-sm flex items-center gap-2">
                    <Scissors size={16} className="text-[#ccff00]" /> Xóa nền AI
                </div>
                <button 
                    onClick={handleSave} 
                    disabled={isSaving || !result} 
                    className="bg-[#ccff00] text-black text-[13px] font-bold px-4 py-1.5 rounded active:scale-95 transition-transform disabled:opacity-50"
                >
                    {isSaving ? 'Đang lưu...' : 'Lưu'}
                </button>
            </header>

            <main 
                className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#000000] p-4"
                style={checkerboardStyle}
            >
                {!image ? (
                    <button 
                        onClick={() => fileInputRef.current.click()}
                        className="flex flex-col items-center gap-3 bg-[#18181b]/80 backdrop-blur-sm p-8 rounded-3xl border border-dashed border-white/20 active:scale-95 transition-transform"
                    >
                        <ImageIcon size={48} className="text-gray-400" />
                        <span className="font-medium text-gray-300">Nhấn để chọn ảnh</span>
                    </button>
                ) : (
                    <div className="relative w-full h-full flex items-center justify-center">
                        <img 
                            src={result || image} 
                            alt="Preview" 
                            className="max-w-full max-h-full object-contain drop-shadow-2xl"
                        />
                        
                        {/* Màn hình loading khi AI đang chạy */}
                        {isProcessing && (
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl z-20">
                                <Loader2 size={40} className="text-[#ccff00] animate-spin mb-3" />
                                <span className="font-bold text-sm tracking-widest text-[#ccff00] animate-pulse">
                                    AI ĐANG TÁCH NỀN...
                                </span>
                                <span className="text-[10px] text-gray-400 mt-2 text-center px-6">
                                    Lần đầu chạy có thể tốn chút thời gian để tải mô hình.
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </main>

            <section className="bg-[#0f0f0f] p-6 w-full shrink-0 border-t border-white/5 h-32 flex justify-center items-center gap-6">
                <button 
                    onClick={() => fileInputRef.current.click()}
                    disabled={isProcessing}
                    className="flex flex-col items-center gap-2 text-gray-400 hover:text-white disabled:opacity-50 active:scale-95"
                >
                    <div className="w-12 h-12 rounded-full bg-[#18181b] flex items-center justify-center border border-white/10">
                        <ImageIcon size={20} />
                    </div>
                    <span className="text-[11px] font-medium">Đổi ảnh</span>
                </button>

                <button 
                    onClick={handleRemoveBg}
                    disabled={!image || isProcessing || result}
                    className="flex flex-col items-center gap-2 disabled:opacity-50 active:scale-95 transition-transform group"
                >
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${result ? 'bg-green-500' : 'bg-[#ccff00] group-hover:scale-105'}`}>
                        {result ? <Check size={28} className="text-white" /> : <Scissors size={28} className="text-black" />}
                    </div>
                    <span className={`text-[11px] font-bold ${result ? 'text-green-500' : 'text-[#ccff00]'}`}>
                        {result ? 'ĐÃ XÓA NỀN' : 'TÁCH NỀN'}
                    </span>
                </button>
            </section>
        </div>
    );
}