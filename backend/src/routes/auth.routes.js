const express = require('express');
const bcrypt = require('bcryptjs');
const { createToken } = require('../middleware/auth');

function createAuthRouter(users) {
    const router = express.Router();

    router.post('/register', async (req, res) => {
        const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
        const password = typeof req.body.password === 'string' ? req.body.password : '';

        if (!username || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Tên tài khoản và mật khẩu tối thiểu 6 ký tự là bắt buộc.',
            });
        }

        try {
            const existingUser = await users.findOne({ username });
            if (existingUser) {
                return res.status(409).json({ success: false, message: 'Tên tài khoản đã tồn tại!' });
            }

            const passwordHash = await bcrypt.hash(password, 12);
            await users.insertOne({ username, passwordHash, createdAt: new Date() });
            return res.status(201).json({ success: true, message: 'Đăng ký thành công!' });
        } catch (error) {
            console.error('Lỗi đăng ký:', error);
            return res.status(500).json({ success: false, message: 'Lỗi máy chủ backend!' });
        }
    });

    router.post('/login', async (req, res) => {
        const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
        const password = typeof req.body.password === 'string' ? req.body.password : '';

        try {
            const user = await users.findOne({ username });
            const validPassword = user && await bcrypt.compare(password, user.passwordHash);
            if (!validPassword) {
                return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu!' });
            }

            return res.json({
                success: true,
                token: createToken(user),
                username: user.username,
            });
        } catch (error) {
            console.error('Lỗi đăng nhập:', error);
            return res.status(500).json({ success: false, message: 'Lỗi máy chủ backend!' });
        }
    });

    return router;
}

module.exports = { createAuthRouter };
