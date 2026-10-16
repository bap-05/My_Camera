const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

function createToken(user) {
    return jwt.sign({ sub: user._id.toString(), username: user.username }, config.jwtSecret, {
        expiresIn: '7d',
    });
}

function requireAuth(req, res, next) {
    const authorization = req.headers.authorization || '';
    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
    }

    try {
        req.user = jwt.verify(token, config.jwtSecret);
        return next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
    }
}

module.exports = { createToken, requireAuth };
