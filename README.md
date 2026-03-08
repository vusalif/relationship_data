# Relationship Analytics

An open-source Telegram bot and web dashboard to track and analyze your relationships with people over time. The idea is simple: you add people you want to track, set a daily or weekly reminder in the bot, and put a score out of 10 for each person every cycle. The web dashboard will then show you a beautiful, human-drawn style line chart of how your relationships evolve over time.

## Features
- **Telegram Bot integration**: Easily interact, get reminded, and log your relationship scores without leaving Telegram.
- **Magic Link Login**: Just type `/webapp` in the bot to instantly get a secure link to your dashboard without a password.
- **Hand-drawn Artisanal Aesthetic**: The web interface uses `Inter` and `Kalam` Google Fonts along with a unique CSS design to imitate a physical, handwritten journal/tracker.
- **Detailed Analytics**: See line charts spanning across your history of entered scores.
- **Fully Open Source**: Uses a lightweight native `sqlite3` database. No external APIs or paid subscriptions required.

## Installation

1. Clone or download this project.
2. In the project directory, install dependencies:
   \`\`\`bash
   npm install
   \`\`\`
3. Create a \`.env\` file in the root based on \`.env.example\` or just add your standard environment variables:
   \`\`\`
   BOT_TOKEN=your_telegram_bot_token_here
   PORT=3000
   APP_URL=http://localhost:3000
   \`\`\`
4. Run the setup:
   \`\`\`bash
   npm start
   \`\`\`

## Using the Bot
- Start a chat with your Telegram Bot.
- Send `/start` to see the welcome message.
- Send `/addperson John` to add your friend John.
- Send `/addperson Pam` to add Pam.
- Send `/setcycle daily 18:00` to set the bot to remind you every day at 6:00 PM.
- When the bot reminds you, simply reply with a score out of 10.
- Use `/scorenow` to trigger a manual scoring flow.
- Send `/webapp` to get your Magic Link to your beautiful web dashboard. On the dashboard, you can view your chart, modify previous scores, and delete people.

## Technologies Used
- Express.js
- Telegraf
- SQLite3
- Node-cron
- Vanilla JavaScript & Canvas (Chart.js)
