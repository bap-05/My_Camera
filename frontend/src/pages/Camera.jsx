import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

const FILTERS = [
    { name: 'Gốc', style: 'none' },
    { name: 'Sáng da', style: 'brightness(1.2) contrast(1.1) saturate(1.1)' },
    { name: 'Cổ điển', style: 'sepia(0.6) contrast(1.2) brightness(0.9)' },
    { name: 'Lạnh', style: 'saturate(1.2) hue-rotate(180deg)' },
    { name: 'Trắng đen', style: 'grayscale(1) contrast(1.2)' },
    { name: 'Ấm áp', style: 'sepia(0.4) saturate(1.6) hue-rotate(-15deg)' },
    { name: 'Rực rỡ', style: 'saturate(2.5) contrast(1.2)' },
    { name: 'Phim nhựa', style: 'sepia(0.3) contrast(1.4) brightness(0.9) grayscale(0.2)' },
    { name: 'Mờ ảo', style: 'blur(2px) brightness(1.1) contrast(0.9)' },
    { name: 'Hoàng hôn', style: 'sepia(0.5) hue-rotate(-30deg) saturate(1.8) contrast(1.1)' },
    { name: 'Neon', style: 'hue-rotate(90deg) saturate(2.5) brightness(1.1)' },
    { name: 'Cyberpunk', style: 'hue-rotate(270deg) saturate(2) contrast(1.3)' },
    { name: 'Âm bản', style: 'invert(1)' }
];

export default function Camera() {
    const navigate = useNavigate();
    
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);

    const [activeFilter, setActiveFilter] = useState(FILTERS[0]);
    const [useFrontCamera, setUseFrontCamera] = useState(true);
    const [isFlashing, setIsFlashing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    // Hàm TẮT CAMERA triệt để
    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.stop(); // Tắt đèn tín hiệu camera
            });
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    };

    // Khởi tạo Camera
    const initCamera = async () => {
        setErrorMsg('');
        stopCamera(); // Đảm bảo luồng cũ đã tắt trước khi mở luồng mới
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: useFrontCamera ? "user" : "environment" },
                audio: false
            });
            streamRef.current = stream; 
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            setErrorMsg('Không thể truy cập Camera. Vui lòng cấp quyền.');
        }
    };

    useEffect(() => {
        initCamera();
        
        // Tắt camera khi component bị hủy (ví dụ: f5 lại trang)
        return () => {
            stopCamera();
        };
    }, [useFrontCamera]);

    // Xử lý nút Thoát trang
    const handleClose = () => {
        stopCamera(); // Chủ động tắt camera
        navigate('/'); // Rồi mới quay về Home
    };

    // Xử lý chụp ảnh
    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        setIsFlashing(true);
        
        setTimeout(() => {
            setIsFlashing(false);
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            ctx.filter = activeFilter.style;

            if (useFrontCamera) {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
            
            stopCamera(); // Chủ động tắt camera trước khi sang trang Edit
            navigate('/edit', { state: { image: imageDataUrl } });
            
        }, 100);
    };

    return (
        <div className="bg-black text-white h-screen w-full overflow-hidden relative">
            
            {/* Đổi sự kiện onClick thành hàm handleClose */}
            <button 
                onClick={handleClose} 
                className="absolute top-6 left-6 z-30 bg-black/40 backdrop-blur-md p-2 rounded-full active:bg-black/60 transition-colors"
            >
                <X size={24} color="white" />
            </button>

            <main className="absolute inset-0 flex items-center justify-center overflow-hidden z-0">
                <video 
                    ref={videoRef} 
                    autoPlay playsInline muted
                    className="absolute w-full h-full object-cover transition-all duration-300"
                    style={{ 
                        filter: activeFilter.style,
                        transform: useFrontCamera ? 'scaleX(-1)' : 'scaleX(1)' 
                    }}
                />
                
                {isFlashing && <div className="absolute inset-0 bg-white animate-flash z-20"></div>}

                {errorMsg && (
                    <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6 text-center">
                        <p className="text-red-500 mb-2">{errorMsg}</p>
                        <button onClick={initCamera} className="px-4 py-2 bg-pink-500 rounded-full font-bold">Thử lại</button>
                    </div>
                )}
            </main>

            <section className="absolute bottom-0 left-0 w-full z-10 flex flex-col bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-16 pb-8 pointer-events-auto">
                <div className="w-full overflow-x-auto hide-scrollbar py-4 px-4">
                    <div className="flex gap-4 w-max">
                        {FILTERS.map((filter, index) => (
                            <button 
                                key={index}
                                onClick={() => setActiveFilter(filter)}
                                className={`flex-shrink-0 w-16 h-20 rounded-xl bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center gap-1 transition-all border-2 ${activeFilter.name === filter.name ? 'border-pink-500 text-pink-500 scale-105' : 'border-transparent text-gray-200'}`}
                            >
                                <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-gray-700">
                                    <div className="w-full h-full bg-gradient-to-br from-pink-500 to-orange-400" style={{ filter: filter.style }}></div>
                                </div>
                                <span className="text-xs font-medium drop-shadow-md">{filter.name}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex w-full items-center justify-between px-8 mt-2">
                    <button onClick={() => setUseFrontCamera(!useFrontCamera)} className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center active:bg-black/60 transition">
                        <svg className="w-6 h-6 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    </button>

                    <button onClick={capturePhoto} className="w-20 h-20 rounded-full border-4 border-white/60 p-1 active:scale-95 transition-transform backdrop-blur-sm">
                        <div className="w-full h-full bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.5)]"></div>
                    </button>

                    <div className="w-12 h-12 rounded-lg bg-black/40 backdrop-blur-md overflow-hidden border border-white/20"></div>
                </div>
            </section>

            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}