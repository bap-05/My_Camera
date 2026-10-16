const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { config } = require('./config/env');
const { createAuthRouter } = require('./routes/auth.routes');
const { createImageRouter } = require('./routes/image.routes');

function createApp({ users, imageHistory, videoHistory }) {
    fs.mkdirSync(config.uploadDir, { recursive: true });

    const app = express();
    const allowedOrigins = (process.env.FRONTEND_URL || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    app.use(cors({
        origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    }));
    app.use(express.json({ limit: '50mb' }));
    app.use('/uploads', express.static(config.uploadDir));
    app.use('/api', createAuthRouter(users));
    app.use('/api', createImageRouter(imageHistory, videoHistory));

    return app;
}

module.exports = { createApp };
