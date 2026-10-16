const { MongoClient } = require('mongodb');
const { config } = require('./env');

async function connectDatabase() {
    const client = new MongoClient(config.mongodbUri);
    await client.connect();

    const database = client.db(config.mongodbDb);
    const users = database.collection('users');
    const imageHistory = database.collection('image_history');
    const videoHistory = database.collection('video_history');

    await users.createIndex({ username: 1 }, { unique: true });
    await imageHistory.createIndex({ userId: 1, createdAt: -1 });
    await videoHistory.createIndex({ userId: 1, createdAt: -1 });

    return { users, imageHistory, videoHistory };
}

module.exports = { connectDatabase };
