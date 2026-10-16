const { createApp } = require('./src/app');
const { connectDatabase } = require('./src/config/database');
const { config } = require('./src/config/env');

async function start() {
    const collections = await connectDatabase();
    const app = createApp(collections);

    app.listen(config.port, '0.0.0.0', () => {
        console.log(`Backend đang chạy tại http://0.0.0.0:${config.port}`);
        console.log(`Đã kết nối MongoDB database "${config.mongodbDb}"`);
    });
}

start().catch((error) => {
    console.error('Không thể khởi động backend:', error);
    process.exit(1);
});
