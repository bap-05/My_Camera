import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Crown, Camera } from 'lucide-react';
import { apiUrl } from '../api';

export default function Login() {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            // Nhớ thay đổi IP mạng LAN nếu máy bạn bị đổi IP
            const res = await fetch(apiUrl('/api/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await res.json();
            
            if (data.success) {
                // Lưu trạng thái đăng nhập vào bộ nhớ điện thoại
                localStorage.setItem('auth_token', data.token);
                localStorage.setItem('username', data.username || username);
                navigate('/'); // Chuyển về trang chủ
            } else {
                setError(data.message);
            }
        } catch (err) {
            setError('Không thể kết nối đến Server Node.js');
        }
        setIsLoading(false);
    };

    return (
        <div className="bg-[#0a0a0c] min-h-screen flex flex-col items-center justify-center px-6 font-sans text-white">
            
            {/* Logo & Title */}
            <div className="flex flex-col items-center mb-10">
                <div className="w-20 h-20 bg-gradient-to-tr from-gray-800 to-[#1c1c1e] rounded-3xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(204,255,0,0.15)] border border-white/10">
                    <Camera size={40} className="text-[#ccff00]" />
                </div>
                <h1 className="text-3xl font-bold tracking-wider">PRO CAM</h1>
                <div className="flex items-center gap-1 mt-2 bg-[#1c1c1e] px-3 py-1 rounded-full border border-white/5">
                    <Crown size={14} className="text-yellow-500" />
                    <span className="text-xs text-gray-400 font-medium">Đăng nhập để tiếp tục</span>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm px-4 py-3 rounded-xl text-center">
                        {error}
                    </div>
                )}

                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <User size={20} className="text-gray-500" />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Tài khoản (admin)"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-[#18181b] border border-white/10 text-white text-sm rounded-2xl focus:ring-1 focus:ring-[#ccff00] focus:border-[#ccff00] block pl-12 p-4 transition-all outline-none"
                    />
                </div>

                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock size={20} className="text-gray-500" />
                    </div>
                    <input 
                        type="password" 
                        placeholder="Mật khẩu (123456)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-[#18181b] border border-white/10 text-white text-sm rounded-2xl focus:ring-1 focus:ring-[#ccff00] focus:border-[#ccff00] block pl-12 p-4 transition-all outline-none"
                    />
                </div>

                <button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full bg-[#ccff00] text-black font-bold rounded-2xl text-sm px-5 py-4 text-center active:scale-95 transition-transform mt-6 shadow-[0_0_20px_rgba(204,255,0,0.3)] disabled:opacity-50"
                >
                    {isLoading ? 'ĐANG KẾT NỐI...' : 'ĐĂNG NHẬP'}
                </button>
            </form>

            <div className="mt-8 text-sm text-gray-500 flex flex-col items-center gap-2">
                <div>
                    Chưa có tài khoản? {' '}
                    <button onClick={() => navigate('/register')} className="text-[#ccff00] font-bold hover:underline">
                        Đăng ký ngay
                    </button>
                </div>
                <p className="text-xs opacity-50 mt-4">Phiên bản 1.0.0 (BETA)</p>
            </div>
        </div>
    );
}