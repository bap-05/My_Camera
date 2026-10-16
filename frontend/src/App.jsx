import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Camera from './pages/Camera';
import Edit from './pages/Edit';
import Login from './pages/Login'; // <--- Thêm dòng này
import Register from './pages/Register';
import Profile from './pages/Profile';
import Collage from './pages/Collage';
import RemoveBg from './pages/RemoveBg';
import VideoEdit from './pages/VideoEdit';
// Hàm kiểm tra xem đã đăng nhập chưa
const ProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        return <Navigate to="/login" replace />;
    }
    return children;
};

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Login />} />
                
                {/* Bọc các trang cần bảo vệ bên trong ProtectedRoute */}
                <Route path="/" element={
                    <ProtectedRoute><Home /></ProtectedRoute>
                } />
                <Route path="/camera" element={
                    <ProtectedRoute><Camera /></ProtectedRoute>
                } />
                <Route path="/edit" element={
                    <ProtectedRoute><Edit /></ProtectedRoute>
                } />
                <Route path="/profile" element={
                    <ProtectedRoute><Profile /></ProtectedRoute>
                } />
                <Route path="/collage" element={
                    <ProtectedRoute><Collage /></ProtectedRoute>
                } />
                <Route path="/remove-bg" element={
                    <ProtectedRoute><RemoveBg /></ProtectedRoute>
                } />
                <Route path="/video" element={<ProtectedRoute><VideoEdit /></ProtectedRoute>} />
                <Route path="/register" element={<Register />} /> {/* <--- Thêm Route Đăng ký */}
            </Routes>
        </BrowserRouter>
    );
}