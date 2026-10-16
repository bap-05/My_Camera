import { useNavigate } from 'react-router-dom';
import { 
    User, Settings, Shield, Bell, 
    Crown, LogOut, ChevronRight, Home as HomeIcon, LayoutTemplate 
} from 'lucide-react';

export default function Profile() {
    const navigate = useNavigate();
    // Lấy tên tài khoản từ bộ nhớ, nếu không có thì để mặc định
    const username = localStorage.getItem('username') || 'Người dùng';

    const handleLogout = () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('username');
        navigate('/login');
    };

    const handleComingSoon = () => {
        alert("Tính năng đang được phát triển!");
    };

    return (
        <div className="bg-[#0a0a0c] min-h-screen pb-24 font-sans text-white selection:bg-[#ccff00]">
            
            <header className="px-5 pt-8 pb-4">
                <h1 className="text-2xl font-bold tracking-wide">Hồ sơ của tôi</h1>
            </header>

            <main className="px-5 space-y-6">
                {/* 1. Thẻ thông tin User */}
                <div className="bg-[#18181b] rounded-3xl p-5 border border-white/5 flex items-center gap-4 shadow-lg">
                    <div className="w-16 h-16 bg-gradient-to-tr from-[#ccff00] to-green-500 rounded-full flex items-center justify-center text-black font-bold text-2xl shadow-[0_0_15px_rgba(204,255,0,0.3)] uppercase">
                        {username.charAt(0)}
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-bold">{username}</h2>
                        <div className="flex items-center gap-1 mt-1 bg-white/5 w-max px-2 py-0.5 rounded-full border border-white/10">
                            <Crown size={12} className="text-yellow-500" />
                            <span className="text-[10px] text-gray-300">Thành viên PRO</span>
                        </div>
                    </div>
                </div>

                {/* 2. Menu Cài đặt */}
                <div className="bg-[#18181b] rounded-3xl p-2 border border-white/5 shadow-lg">
                    {[
                        { icon: Shield, label: 'Tài khoản & Bảo mật', color: 'text-blue-400' },
                        { icon: Bell, label: 'Thông báo', color: 'text-yellow-400' },
                        { icon: Settings, label: 'Cài đặt ứng dụng', color: 'text-gray-300' },
                    ].map((item, i) => (
                        <button key={i} onClick={handleComingSoon} className="w-full flex items-center justify-between p-4 active:bg-white/5 rounded-2xl transition-colors">
                            <div className="flex items-center gap-3">
                                <item.icon size={20} className={item.color} />
                                <span className="font-medium text-sm text-gray-200">{item.label}</span>
                            </div>
                            <ChevronRight size={16} className="text-gray-500" />
                        </button>
                    ))}
                </div>

                {/* 3. Nút Đăng xuất */}
                <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 bg-red-500/10 text-red-500 p-4 rounded-3xl font-bold active:scale-95 transition-transform border border-red-500/20">
                    <LogOut size={20} />
                    Đăng xuất
                </button>
            </main>

            {/* Bottom Navigation (Nút "Tôi" đang sáng) */}
            <nav className="fixed bottom-0 left-0 w-full bg-[#09090b]/95 backdrop-blur-md border-t border-white/10 flex justify-around py-3 z-50">
                <button onClick={() => navigate('/')} className="flex flex-col items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors">
                    <HomeIcon size={22} />
                    <span className="text-[10px] font-medium">Chỉnh sửa</span>
                </button>
                <button onClick={handleComingSoon} className="flex flex-col items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors">
                    <LayoutTemplate size={22} />
                    <span className="text-[10px] font-medium">Mẫu</span>
                </button>
                <button className="flex flex-col items-center gap-1 text-white">
                    <User size={22} className="drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                    <span className="text-[10px] font-bold">Tôi</span>
                </button>
            </nav>
        </div>
    );
}