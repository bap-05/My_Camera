import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { 
    X, ChevronDown, Sun, Contrast, Droplets, Palette, 
    Check, Wand2, Scissors, Smile, Zap, Crop as CropIcon 
} from 'lucide-react';
import { apiUrl, authHeaders } from '../api';

const DEFAULT_SETTINGS = {
    brightness: 100, contrast: 100, saturate: 100, hueRotate: 0, sepia: 0, grayscale: 0, blur: 0
};

// Khung cắt mặc định chiếm 80% ảnh, căn giữa
const DEFAULT_CROP = { unit: '%', width: 80, height: 80, x: 10, y: 10 };

const saveImageToDevice = async (imageData, fileName) => {
    if (Capacitor.isNativePlatform()) {
        const base64Data = imageData.split(',')[1];
        await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
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

export default function Edit() {
    const location = useLocation();
    const navigate = useNavigate();

    const [currentImage, setCurrentImage] = useState(location.state?.image);
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [activeMainTab, setActiveMainTab] = useState('Điều chỉnh');
    const [activeTool, setActiveTool] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showOriginal, setShowOriginal] = useState(false);

    const [isCropping, setIsCropping] = useState(false);
    const [crop, setCrop] = useState(DEFAULT_CROP);
    const [completedCrop, setCompletedCrop] = useState(null);
    const imgRef = useRef(null);

    const currentFilterStyle = `
        brightness(${settings.brightness}%) 
        contrast(${settings.contrast}%) 
        saturate(${settings.saturate}%) 
        hue-rotate(${settings.hueRotate}deg) 
        sepia(${settings.sepia}%) 
        grayscale(${settings.grayscale}%) 
        blur(${settings.blur}px)
    `;

    const applyCrop = () => {
        if (!completedCrop || !completedCrop.width || !completedCrop.height || !imgRef.current) {
            setIsCropping(false);
            return;
        }

        const canvas = document.createElement('canvas');
        const img = imgRef.current;
        
        const scaleX = img.naturalWidth / img.width;
        const scaleY = img.naturalHeight / img.height;

        canvas.width = completedCrop.width * scaleX;
        canvas.height = completedCrop.height * scaleY;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
            img,
            completedCrop.x * scaleX,
            completedCrop.y * scaleY,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
            0,
            0,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY
        );

        setCurrentImage(canvas.toDataURL('image/jpeg', 1));
        setIsCropping(false);
    };

    const handleSave = () => {
        if (!currentImage) return;
        setIsSaving(true);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = async () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.filter = currentFilterStyle;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            const finalImageData = canvas.toDataURL('image/jpeg', 0.95);
            const fileName = `ProCam_Edit_${Date.now()}.jpg`;

            try {
                await saveImageToDevice(finalImageData, fileName);
                const res = await fetch(apiUrl('/api/upload'), {
                    method: 'POST',
                    headers: authHeaders(true),
                    body: JSON.stringify({ image: finalImageData, operation: 'edit' })
                });
                
                if (res.ok) {
                    alert(Capacitor.isNativePlatform()
                        ? 'Đã lưu ảnh vào thư mục Tài liệu trên điện thoại!'
                        : 'Lưu ảnh thành công!');
                    navigate('/');
                } else alert('Ảnh đã lưu trên thiết bị nhưng lỗi khi lưu lên server');
            } catch (error) {
                console.error(error);
                alert('Không thể lưu ảnh trên thiết bị hoặc kết nối Server');
            }
            setIsSaving(false);
        };
        img.src = currentImage;
    };

    const handleSliderChange = (e) => setSettings({ ...settings, [activeTool.key]: e.target.value });
    const resetCurrentTool = () => setSettings({ ...settings, [activeTool.key]: DEFAULT_SETTINGS[activeTool.key] });

    const TOOLS = {
        'Điều chỉnh': [
            { 
                id: 'crop', 
                name: 'Cắt ảnh', 
                icon: CropIcon, 
                action: () => {
                    setCrop(DEFAULT_CROP); // Reset lại khung mặc định mỗi lần mở
                    setIsCropping(true);
                } 
            },
            { id: 'brightness', name: 'Độ sáng', icon: Sun, min: 0, max: 200, key: 'brightness' },
            { id: 'contrast', name: 'Độ tương phản', icon: Contrast, min: 0, max: 200, key: 'contrast' },
            { id: 'saturate', name: 'Độ bão hòa', icon: Droplets, min: 0, max: 200, key: 'saturate' },
            { id: 'hue', name: 'Tông màu', icon: Palette, min: -180, max: 180, key: 'hueRotate' },
        ],
        'Bộ lọc': [
            { id: 'f_normal', name: 'Gốc', action: () => setSettings(DEFAULT_SETTINGS) },
            { id: 'f_vintage', name: 'Cổ điển', action: () => setSettings({...DEFAULT_SETTINGS, sepia: 60, contrast: 110}) },
            { id: 'f_bw', name: 'Trắng đen', action: () => setSettings({...DEFAULT_SETTINGS, grayscale: 100, contrast: 120}) },
            { id: 'f_cold', name: 'Lạnh', action: () => setSettings({...DEFAULT_SETTINGS, hueRotate: 180, saturate: 120}) },
            { id: 'f_warm', name: 'Ấm áp', action: () => setSettings({...DEFAULT_SETTINGS, sepia: 30, saturate: 140}) },
        ],
        'Làm đẹp': [{ id: 'coming_1', name: 'Làm mịn da', icon: Smile }],
        'Xóa': [{ id: 'coming_2', name: 'Xóa vật thể', icon: Scissors }],
        'Hiệu ứng': [{ id: 'coming_3', name: 'Glow (AI)', icon: Zap }]
    };

    if (!currentImage) return <div className="h-screen bg-black" />;

    return (
        <div className="bg-[#0a0a0c] text-white h-screen w-full flex flex-col font-sans selection:bg-[#ccff00] overflow-hidden">
            
            <header className="flex justify-between items-center px-4 py-4 z-10 bg-[#121212]">
                <button onClick={() => navigate(-1)} className="p-1 active:scale-90 transition-transform">
                    <X size={24} className="text-white" />
                </button>
                <button className="flex items-center gap-2 bg-[#2c2c2e] text-gray-300 text-[11px] font-medium px-3 py-1.5 rounded border border-white/5">
                    Nâng cao chất lượng <ChevronDown size={14} className="text-gray-400" />
                </button>
                <button onClick={handleSave} disabled={isSaving || isCropping} className="bg-[#ccff00] text-black text-[13px] font-bold px-4 py-1.5 rounded active:scale-95 transition-transform disabled:opacity-50">
                    {isSaving ? 'Đang xuất...' : 'Xuất'}
                </button>
            </header>

            <main 
                className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#000000] touch-none"
                onPointerDown={() => !isCropping && setShowOriginal(true)}
                onPointerUp={() => !isCropping && setShowOriginal(false)}
                onPointerLeave={() => !isCropping && setShowOriginal(false)}
            >
                {isCropping ? (
                    <ReactCrop 
                        crop={crop} 
                        onChange={c => setCrop(c)} 
                        onComplete={c => setCompletedCrop(c)}
                        className="max-h-[60vh] max-w-full"
                    >
                        <img 
                            ref={imgRef}
                            src={currentImage} 
                            alt="Crop target" 
                            className="max-h-[60vh] w-auto object-contain"
                            style={{ filter: currentFilterStyle }}
                        />
                    </ReactCrop>
                ) : (
                    <img 
                        src={currentImage} 
                        alt="Edit preview" 
                        className="w-full h-full object-contain transition-all duration-75"
                        style={{ filter: showOriginal ? 'none' : currentFilterStyle }}
                    />
                )}
                
                {!activeTool && !isCropping && (
                    <div className="absolute top-4 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] text-gray-300 pointer-events-none">
                        Chạm giữ ảnh để xem bản gốc
                    </div>
                )}
            </main>

            <section className="bg-[#0f0f0f] pt-4 pb-6 w-full shrink-0 border-t border-white/5 relative h-36">
                
                {isCropping ? (
                    <div className="flex justify-between items-center px-8 h-full fade-in">
                        <button onClick={() => { setIsCropping(false); setCrop(DEFAULT_CROP); }} className="text-white px-6 py-2 rounded-full bg-gray-800 font-medium active:scale-95">Hủy</button>
                        <div className="text-white font-bold text-sm">Cắt ảnh</div>
                        <button onClick={applyCrop} className="text-black px-6 py-2 rounded-full bg-[#ccff00] font-bold active:scale-95 shadow-[0_0_15px_rgba(204,255,0,0.3)]">Xong</button>
                    </div>
                ) : activeTool ? (
                    <div className="flex flex-col h-full justify-between px-6 fade-in">
                        <div className="flex justify-between items-center text-xs font-bold mb-4">
                            <span className="text-gray-400">{settings[activeTool.key]}</span>
                            <span className="text-[#ccff00]">{activeTool.name}</span>
                            <button onClick={resetCurrentTool} className="text-gray-400 underline">Đặt lại</button>
                        </div>
                        <input 
                            type="range" min={activeTool.min} max={activeTool.max} 
                            value={settings[activeTool.key]} onChange={handleSliderChange}
                            className="w-full accent-[#ccff00] h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer mb-6"
                        />
                        <div className="flex justify-between items-center">
                            <button onClick={() => setActiveTool(null)} className="p-2 active:scale-90"><X size={20}/></button>
                            <button onClick={() => setActiveTool(null)} className="p-2 active:scale-90 text-[#ccff00]"><Check size={20}/></button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col h-full justify-between fade-in">
                        <div className="flex gap-4 overflow-x-auto hide-scrollbar px-5 pb-2">
                            {TOOLS[activeMainTab]?.map((tool, i) => (
                                <button 
                                    key={tool.id || i} 
                                    onClick={() => {
                                        if (tool.action) tool.action();
                                        else if (tool.key) setActiveTool(tool);
                                        else alert('Tính năng AI này đang được phát triển!');
                                    }}
                                    /* Đã tăng chiều rộng nút từ w-16 lên w-[72px] để rộng rãi hơn */
                                    className="flex flex-col items-center gap-1.5 shrink-0 active:scale-90 transition-transform text-gray-300 hover:text-white w-[72px]"
                                >
                                    <div className={`w-10 h-10 flex items-center justify-center rounded-full ${tool.id?.startsWith('f_') ? 'bg-gradient-to-tr from-gray-800 to-gray-600' : 'bg-transparent'}`}>
                                        {tool.icon ? <tool.icon size={22} strokeWidth={1.5} /> : <Wand2 size={20}/>}
                                    </div>
                                    
                                    {/* SỬA TẠI ĐÂY: Bỏ overflow-hidden, thêm pb-1 (padding bottom) và cho phép rớt dòng (break-words) */}
                                    <span className="text-[11px] text-center leading-normal w-full pb-1 break-words px-1">
                                        {tool.name}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-between items-center px-4 mt-2 pt-3 border-t border-[#1f1f1f] text-[11px] font-medium text-gray-400">
                            {Object.keys(TOOLS).map((tab) => (
                                <button 
                                    key={tab} onClick={() => setActiveMainTab(tab)}
                                    className={`px-2 py-1 flex flex-col items-center gap-1 transition-colors ${activeMainTab === tab ? 'text-[#ccff00]' : 'hover:text-gray-200'}`}
                                >
                                    {tab}
                                    {activeMainTab === tab && <div className="w-4 h-0.5 bg-[#ccff00] rounded-full mt-1 drop-shadow-[0_0_4px_rgba(204,255,0,0.8)]"></div>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}