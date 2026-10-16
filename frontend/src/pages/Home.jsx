import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Camera, Plus, Sparkles, Image as ImageIcon, 
    Layout, Scissors, Search, Crown, 
    Home as HomeIcon, LayoutTemplate, User, ChevronRight, LogOut, Video, Trash2 
} from 'lucide-react';
import { apiUrl, authHeaders, mediaUrl } from '../api';

export default function Home() {
    const navigate = useNavigate();
    const [photos, setPhotos] = useState([]);
    const [videos, setVideos] = useState([]);
    const [videoSources, setVideoSources] = useState({});
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [isLoadingVideoHistory, setIsLoadingVideoHistory] = useState(true);
    const [historyError, setHistoryError] = useState('');
    const [videoHistoryError, setVideoHistoryError] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
        setHistoryError('');
        setIsLoadingHistory(true);
        fetch(apiUrl(`/api/images?t=${Date.now()}`), {
            headers: authHeaders(),
            cache: 'no-store',
        })
            .then(res => {
                if (!res.ok) throw new Error(`Không thể tải lịch sử ảnh (${res.status})`);
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data)) {
                    return Promise.all(data.map(async (item) => {
                        const url = item.id
                            ? apiUrl(`/api/images/${item.id}/content`)
                            : mediaUrl(item.imageUrl);
                        const response = await fetch(url, {
                            headers: authHeaders(),
                            cache: 'no-store',
                        });
                        if (!response.ok) throw new Error(`Không thể tải ảnh (${response.status})`);
                        const blob = await response.blob();
                        return { ...item, url: URL.createObjectURL(blob) };
                    }));
                }
                return [];
            })
            .then(setPhotos)
            .catch(err => {
                console.error('Lỗi tải danh sách ảnh:', err);
                setPhotos([]);
                setHistoryError(err.message || 'Không thể tải lịch sử ảnh.');
            })
            .finally(() => setIsLoadingHistory(false));
    }, []);

    useEffect(() => {
        setVideoHistoryError('');
        setIsLoadingVideoHistory(true);
        fetch(apiUrl(`/api/videos?t=${Date.now()}`), {
            headers: authHeaders(),
            cache: 'no-store',
        })
            .then(res => {
                if (!res.ok) throw new Error(`Không thể tải lịch sử video (${res.status})`);
                return res.json();
            })
            .then(async (data) => {
                const videoItems = Array.isArray(data) ? data : [];
                const loadedSources = await Promise.all(videoItems.map(async (item) => {
                    const response = await fetch(apiUrl(item.videoUrl), {
                        headers: authHeaders(),
                        cache: 'no-store',
                    });
                    if (!response.ok) throw new Error(`Không thể tải video (${response.status})`);
                    const blob = await response.blob();
                    return [item.id, URL.createObjectURL(blob)];
                }));
                setVideos(videoItems);
                setVideoSources(Object.fromEntries(loadedSources));
            })
            .catch(err => {
                console.error('Lỗi tải danh sách video:', err);
                setVideos([]);
                setVideoSources({});
                setVideoHistoryError(err.message || 'Không thể tải lịch sử video.');
            })
            .finally(() => setIsLoadingVideoHistory(false));

        return () => {
            setVideoSources((currentSources) => {
                Object.values(currentSources).forEach((url) => URL.revokeObjectURL(url));
                return {};
            });
        };
    }, []);

    const handleEdit = (photoUrl) => {
        navigate('/edit', { state: { image: photoUrl } });
    };

    const handleDeleteHistory = async (type, item) => {
        const label = type === 'image' ? 'ảnh' : 'video';
        if (!window.confirm(`Bạn có chắc muốn xóa ${label} này khỏi lịch sử không?`)) return;

        try {
            const response = await fetch(apiUrl(`/api/${type === 'image' ? 'images' : 'videos'}/${item.id}`), {
                method: 'DELETE',
                headers: authHeaders(),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                throw new Error(data.message || `Không thể xóa ${label}.`);
            }

            if (type === 'image') {
                URL.revokeObjectURL(item.url);
                setPhotos((current) => current.filter((photo) => photo.id !== item.id));
            } else {
                if (videoSources[item.id]) URL.revokeObjectURL(videoSources[item.id]);
                setVideos((current) => current.filter((video) => video.id !== item.id));
                setVideoSources((current) => {
                    const next = { ...current };
                    delete next[item.id];
                    return next;
                });
            }
        } catch (error) {
            console.error(`Lỗi xóa ${label}:`, error);
            alert(error instanceof Error ? error.message : `Không thể xóa ${label}.`);
        }
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                navigate('/edit', { state: { image: reader.result } });
            };
            reader.readAsDataURL(file);
        }
        event.target.value = null; 
    };

    const handleComingSoon = () => {
        alert("Tính năng này đang được phát triển!");
    };

    const handleLogout = () => {
        localStorage.removeItem('auth_token');
        navigate('/login');
    };

    return (
        <div className="bg-black text-white min-h-screen pb-24 font-sans selection:bg-pink-500">
            
            <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
            />

            {/* Header đã được bổ sung nút Đăng xuất */}
            <header className="flex justify-between items-center px-5 pt-6 pb-4">
                <h1 className="text-2xl font-bold tracking-wide">My Camera</h1>
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-black text-[10px] font-extrabold px-2 py-1 rounded-full flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.3)]">
                        <Crown size={12} /> PRO
                    </div>
                    <button onClick={handleComingSoon}>
                        <Search size={22} className="text-gray-300 active:scale-95" />
                    </button>
                    {/* Nút Đăng xuất */}
                    <button onClick={handleLogout} className="text-red-500 active:scale-95 transition-transform">
                        <LogOut size={22} />
                    </button>
                </div>
            </header>

            <main className="px-5 space-y-6">
                
                <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-800 shadow-lg">
                    <img 
                        src="https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=800&auto=format&fit=crop" 
                        className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-overlay" 
                        alt="Banner" 
                    />
                    <div className="absolute inset-0 p-5 flex flex-col justify-center">
                        <h2 className="text-3xl font-serif italic mb-0 text-white drop-shadow-lg">Flash Digicam</h2>
                        <p className="text-lg font-light italic text-gray-200 drop-shadow-md">One-Tap Photo</p>
                        <button onClick={() => navigate('/camera')} className="mt-3 bg-white/20 backdrop-blur-md border border-white/40 text-white px-5 py-1.5 rounded-full w-max text-xs font-bold active:scale-95 transition-transform cursor-pointer z-10 hover:bg-white/30">
                            Shoot Now!
                        </button>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button 
                        onClick={() => fileInputRef.current.click()} 
                        className="flex-1 bg-[#18181b] hover:bg-[#27272a] transition-colors rounded-2xl p-4 flex flex-col items-center justify-center gap-2 border border-white/5 shadow-sm active:scale-95"
                    >
                        <Plus size={28} className="text-green-400" />
                        <span className="font-semibold text-sm">Chỉnh sửa ảnh</span>
                    </button>
                    
                    <button 
                        onClick={() => navigate('/camera')} 
                        className="flex-1 bg-[#18181b] hover:bg-[#27272a] transition-colors rounded-2xl p-4 flex flex-col items-center justify-center gap-2 border border-white/5 shadow-sm active:scale-95"
                    >
                        <Camera size={28} className="text-yellow-400" />
                        <span className="font-semibold text-sm">Camera kỹ thuật số</span>
                    </button>
                    <button 
                        onClick={() => navigate('/video')} 
                        className="flex-1 bg-[#18181b] hover:bg-[#27272a] transition-colors rounded-2xl p-4 flex flex-col items-center justify-center gap-2 border border-white/5 shadow-sm active:scale-95"
                    >
                        <Video size={28} className="text-yellow-400" />
                        <span className="font-semibold text-sm">Chỉnh sửa Video</span>
                    </button>
                </div>

                <div className="flex justify-between items-start px-2">
                    {[
                        { icon: Sparkles, label: 'Nhập mẫu AI', route: 'soon' },
                        { icon: ImageIcon, label: 'Trình chỉnh sửa', route: 'soon' },
                        { icon: Layout, label: 'Ảnh ghép', route: '/collage' }, // <--- Sửa dòng này
                        { icon: Scissors, label: 'Xóa nền', route: '/remove-bg' },
                    ].map((tool, i) => (
                        <div 
                            key={i} 
                            // Sửa lại sự kiện onClick ở đây
                            onClick={() => tool.route === 'soon' ? handleComingSoon() : navigate(tool.route)} 
                            className="flex flex-col items-center gap-2 w-16 cursor-pointer active:scale-95 transition-transform"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-[#18181b] flex items-center justify-center border border-white/5 shadow-sm">
                                <tool.icon size={20} className="text-gray-300" />
                            </div>
                            <span className="text-[10px] text-gray-400 text-center leading-tight">{tool.label}</span>
                        </div>
                    ))}
                </div>

                <div>
                    <div className="flex justify-between items-end mb-3">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            <Video size={20} className="text-[#ccff00]" />
                            Video đã chỉnh sửa
                        </h3>
                        <button onClick={() => navigate('/video')} className="text-xs bg-[#18181b] px-3 py-1.5 rounded-full text-gray-300 font-medium border border-white/5 active:scale-95">
                            Tạo video
                        </button>
                    </div>

                    <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
                        {isLoadingVideoHistory ? (
                            <div className="w-40 h-28 flex items-center justify-center text-xs text-gray-500 bg-[#18181b] rounded-xl border border-white/5">
                                Đang tải...
                            </div>
                        ) : videoHistoryError ? (
                            <div className="w-64 h-28 flex items-center justify-center text-xs text-red-400 text-center bg-[#18181b] rounded-xl border border-red-500/20 px-3">
                                {videoHistoryError}
                            </div>
                        ) : videos.length === 0 ? (
                            <div className="w-full h-28 flex items-center justify-center text-xs text-gray-600 bg-[#18181b] rounded-xl border border-white/5">
                                Chưa có video đã chỉnh sửa
                            </div>
                        ) : (
                            videos.map((video) => (
                                <div key={video.id} className="relative w-44 shrink-0">
                                    <video
                                        src={videoSources[video.id]}
                                        controls
                                        playsInline
                                        preload="metadata"
                                        onError={(event) => {
                                            console.error('Không thể phát video lịch sử:', video.videoUrl, event.currentTarget.error);
                                        }}
                                        className="w-44 h-28 rounded-xl object-cover border border-white/10 bg-[#18181b]"
                                    />
                                    <button
                                        type="button"
                                        title="Xóa video"
                                        onClick={() => handleDeleteHistory('video', video)}
                                        className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-red-300 hover:bg-red-500 hover:text-white"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                    <p className="mt-1 text-[10px] text-gray-500">
                                        {video.createdAt ? new Date(video.createdAt).toLocaleString('vi-VN') : 'Video đã chỉnh sửa'}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-end mb-3">
                        <h3 className="font-bold text-lg">Bắt đầu chỉnh sửa</h3>
                        <button onClick={handleComingSoon} className="text-xs bg-[#18181b] px-3 py-1.5 rounded-full text-gray-300 font-medium border border-white/5 active:scale-95">Tất cả ảnh</button>
                    </div>
                    
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
                        <div onClick={() => navigate('/camera')} className="w-20 h-24 bg-[#18181b] rounded-xl flex flex-col items-center justify-center gap-1 shrink-0 border border-white/5 active:scale-95 transition-transform cursor-pointer">
                            <Camera size={20} className="text-gray-400" />
                        </div>

                        {isLoadingHistory ? (
                            <div className="w-40 h-24 flex items-center justify-center text-xs text-gray-500 bg-[#18181b] rounded-xl border border-white/5">
                                Đang tải...
                            </div>
                        ) : historyError ? (
                            <div className="w-64 h-24 flex items-center justify-center text-xs text-red-400 text-center bg-[#18181b] rounded-xl border border-red-500/20 px-3">
                                {historyError}
                            </div>
                        ) : photos.length === 0 ? (
                            <div className="w-40 h-24 flex items-center justify-center text-xs text-gray-600 bg-[#18181b] rounded-xl border border-white/5">Thư viện trống</div>
                        ) : (
                            photos.map((photo, idx) => (
                                <div key={photo.id || idx} className="relative w-20 h-24 shrink-0">
                                    <img 
                                        src={photo.url} 
                                        onClick={() => handleEdit(photo.url)} 
                                        onError={(event) => {
                                            console.error('Không thể hiển thị ảnh lịch sử:', photo.url);
                                            event.currentTarget.style.display = 'none';
                                        }}
                                        className="w-20 h-24 rounded-xl object-cover cursor-pointer active:scale-95 transition-transform border border-white/10" 
                                        alt={`recent-${idx}`} 
                                    />
                                    <button
                                        type="button"
                                        title="Xóa ảnh"
                                        onClick={() => handleDeleteHistory('image', photo)}
                                        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-red-300 hover:bg-red-500 hover:text-white"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-bold text-lg flex items-center gap-1">🔥 Dành cho bạn</h3>
                        <button onClick={handleComingSoon} className="w-6 h-6 bg-[#18181b] rounded-full flex items-center justify-center text-gray-400 border border-white/5 active:scale-95">
                            <ChevronRight size={14} />
                        </button>
                    </div>
                    <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-4">
                        {[
                            { img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&auto=format&fit=crop', title: 'AI Avatar' },
                            { img: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=400&auto=format&fit=crop', title: 'Sitting in the yard' },
                            { img: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=400&auto=format&fit=crop', title: 'Filter leafy' },
                        ].map((tpl, i) => (
                            <div key={i} onClick={handleComingSoon} className="w-32 h-44 rounded-xl overflow-hidden relative shrink-0 border border-white/10 cursor-pointer active:scale-95 transition-transform">
                                <img src={tpl.img} className="w-full h-full object-cover" alt="template" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                                <div className="absolute bottom-2 left-2 text-xs font-medium text-white drop-shadow-md">{tpl.title}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            <nav className="fixed bottom-0 left-0 w-full bg-[#09090b]/95 backdrop-blur-md border-t border-white/10 flex justify-around py-3 z-50">
                <button className="flex flex-col items-center gap-1 text-white">
                    <HomeIcon size={22} className="drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                    <span className="text-[10px] font-bold">Chỉnh sửa</span>
                </button>
                <button onClick={handleComingSoon} className="flex flex-col items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors">
                    <LayoutTemplate size={22} />
                    <span className="text-[10px] font-medium">Mẫu</span>
                </button>
                {/* Nút Tôi đã được trả về mặc định */}
                <button onClick={() => navigate('/profile')} className="flex flex-col items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors">
                    <User size={22} />
                    <span className="text-[10px] font-medium">Tôi</span>
                </button>
            </nav>
        </div>
    );
}