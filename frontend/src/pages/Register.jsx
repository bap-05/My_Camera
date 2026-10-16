import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Camera, Sparkles } from 'lucide-react';
import { apiUrl } from '../api';

export default function Register() {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            return setError('Mật khẩu xác nhận không khớp!');
        }

        setIsLoading(true);
        try {
            const res = await fetch(apiUrl('/api/register'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await res.json();
            
            if (data.success) {
                alert('Đăng ký thành công! Vui lòng đăng nhập.');
                navigate('/login'); // Chuyển về trang đăng nhập
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
            
            <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 bg-gradient-to-tr from-gray-800 to-[#1c1c1e] rounded-3xl flex items-center justify-center mb-4 border border-white/10">
                    <Camera size={32} className="text-[#ccff00]" />
                </div>
                <h1 className="text-2xl font-bold tracking-wider mb-2">TẠO TÀI KHOẢN</h1>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Sparkles size={14} className="text-pink-500" /> Tham gia hệ sinh thái PRO
                </div>
            </div>

            <form onSubmit={handleRegister} className="w-full max-w-sm space-y-4">
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
                        type="text" placeholder="Tên tài khoản mới" required
                        value={username} onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-[#18181b] border border-white/10 text-white text-sm rounded-2xl focus:ring-1 focus:ring-[#ccff00] focus:border-[#ccff00] block pl-12 p-4 outline-none transition-all"
                    />
                </div>

                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock size={20} className="text-gray-500" />
                    </div>
                    <input 
                        type="password" placeholder="Mật khẩu" required minLength="6"
                        value={password} onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-[#18181b] border border-white/10 text-white text-sm rounded-2xl focus:ring-1 focus:ring-[#ccff00] focus:border-[#ccff00] block pl-12 p-4 outline-none transition-all"
                    />
                </div>

                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock size={20} className="text-gray-500" />
                    </div>
                    <input 
                        type="password" placeholder="Xác nhận lại mật khẩu" required minLength="6"
                        value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-[#18181b] border border-white/10 text-white text-sm rounded-2xl focus:ring-1 focus:ring-[#ccff00] focus:border-[#ccff00] block pl-12 p-4 outline-none transition-all"
                    />
                </div>

                <button 
                    type="submit" disabled={isLoading}
                    className="w-full bg-white text-black font-bold rounded-2xl text-sm px-5 py-4 text-center active:scale-95 transition-transform mt-4 disabled:opacity-50"
                >
                    {isLoading ? 'ĐANG XỬ LÝ...' : 'ĐĂNG KÝ'}
                </button>
            </form>

            <div className="mt-8 text-sm text-gray-500">
                Đã có tài khoản? {' '}
                <button onClick={() => navigate('/login')} className="text-[#ccff00] font-bold hover:underline">
                    Đăng nhập ngay
                </button>
            </div>
        </div>
    );
}