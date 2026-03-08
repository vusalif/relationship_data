require('dotenv').config();
const app = require('./server');
const { bot, startScoringFlow } = require('./bot');
const cron = require('node-cron');
const db = require('./database');

function getQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

// Start HTTP server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Start Telegram Bot
bot.launch().then(() => {
    console.log('Telegram bot is running.');
}).catch((err) => {
    console.error('Failed to launch Telegram Bot. Did you set BOT_TOKEN in .env?', err.message);
});

// Setup Cron Job - Checks every minute
cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        const hours = ('0' + now.getHours()).slice(-2);
        const minutes = ('0' + now.getMinutes()).slice(-2);
        const currentTime = `${hours}:${minutes}`;
        const dayOfWeek = now.getDay(); // 0-6, 0=Sunday

        // Find users matching current time
        const users = await getQuery(`SELECT * FROM users WHERE cycle_time = ?`, [currentTime]);

        for (let user of users) {
            if (user.cycle_type === 'daily') {
                startScoringFlow(user.chat_id, null, now.toISOString().split('T')[0]);
            } else if (user.cycle_type === 'weekly') {
                // Let's assume weekly is Sunday
                if (dayOfWeek === 0) {
                    startScoringFlow(user.chat_id, null, now.toISOString().split('T')[0]);
                }
            }
        }
    } catch (e) {
        console.error('Cron job error:', e);
    }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
