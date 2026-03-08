const { Telegraf, Markup } = require('telegraf');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const bot = new Telegraf(process.env.BOT_TOKEN || 'dummy_token');

// Utility function to execute DB queries cleanly
function runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}
function getQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

bot.start(async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const token = uuidv4();
    await runQuery(`INSERT OR IGNORE INTO users (chat_id, username, web_token) VALUES (?, ?, ?)`, [chatId, ctx.from.username || '', token]);
    const helpText = `Welcome to Favorite Things Tracker! 📊\n\nI am your personal assistant for tracking and analyzing your favorite things (movies, series, relationships, etc.) over time.\n\nHere is what you can do:\n/add <name> - Add something to track\n/remove <name> - Remove something from tracking\n/list - View your favorites and their latest scores\n/view <name> - View all score history for a specific thing\n/scorenow - Give a score to your favorites right now\n/setcycle [daily|weekly] [HH:MM] - Set a notification schedule\n/webapp - Get a magic link to view your analytics dashboard\n/help - Show this list of commands again`;
    ctx.reply(helpText);
});

bot.command('help', (ctx) => {
    const helpText = `Here is what you can do:\n/add <name> - Add something to track\n/remove <name> - Remove something from tracking\n/list - View your favorites and their latest scores\n/view <name> - View all score history for a specific thing\n/scorenow - Give a score to your favorites right now\n/setcycle [daily|weekly] [HH:MM] - Set a notification schedule\n/webapp - Get a magic link to view your analytics dashboard\n/help - Show this message again`;
    ctx.reply(helpText);
});

bot.command('list', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const lists = await getQuery(`SELECT id, name FROM lists WHERE chat_id = ? ORDER BY id ASC`, [chatId]);

    if (lists.length === 0) {
        const headlessItems = await getQuery(`SELECT id, name FROM persons WHERE chat_id = ?`, [chatId]);
        if (headlessItems.length === 0) {
            return ctx.reply('You have no items in your lists. Use /add to add something.');
        } else {
            // Ad-hoc display
            lists.push({ id: 0, name: 'My Favorites' });
        }
    }

    let msg = '📋 Your Favorites:\n\n';

    for (let l of lists) {
        msg += `📁 *${l.name}*\n`;
        const items = await getQuery(`SELECT id, name FROM persons WHERE chat_id = ? AND (list_id = ? OR (? = 0 AND (list_id IS NULL OR list_id = 0))) ORDER BY id ASC`, [chatId, l.id, l.id]);
        if (items.length === 0) {
            msg += `  (Empty)\n`;
        } else {
            for (let p of items) {
                const scores = await getQuery(`SELECT score, date FROM scores WHERE person_id = ? ORDER BY date DESC LIMIT 1`, [p.id]);
                if (scores.length > 0) {
                    msg += `  - ${p.name}: ${scores[0].score}/10 (Last logged: ${scores[0].date})\n`;
                } else {
                    msg += `  - ${p.name}: No scores yet\n`;
                }
            }
        }
        msg += `\n`;
    }

    const MAX_LEN = 4000;
    while (msg.length > 0) {
        await ctx.reply(msg.substring(0, MAX_LEN), { parse_mode: 'Markdown' });
        msg = msg.substring(MAX_LEN);
    }
});

bot.command(['add', 'addperson'], async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const name = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!name) return ctx.reply('Please specify a name: /add Inception');

    let lists = await getQuery(`SELECT id, name FROM lists WHERE chat_id = ?`, [chatId]);

    // Auto-migrate or auto-create first list if none exist
    if (lists.length === 0) {
        const res = await runQuery(`INSERT INTO lists (chat_id, name) VALUES (?, ?)`, [chatId, 'My Favorites']);
        lists = [{ id: res.lastID, name: 'My Favorites' }];
    }

    if (lists.length === 1) {
        await runQuery(`INSERT INTO persons (chat_id, list_id, name) VALUES (?, ?, ?)`, [chatId, lists[0].id, name]);
        return ctx.reply(`Added ${name} to your "${lists[0].name}" list.`);
    }

    // Multiple lists: Ask the user
    // Make sure button payload isn't too long (Telegram limit ~64 chars)
    const buttons = lists.map(l => Markup.button.callback(l.name, `additem_${l.id}_${name.substring(0, 30)}`));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));

    ctx.reply(`Which list do you want to add "${name}" to?`, Markup.inlineKeyboard(rows));
});

bot.action(/additem_(\d+)_(.+)/, async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const listId = ctx.match[1];
    const name = ctx.match[2];

    const lists = await getQuery(`SELECT id, name FROM lists WHERE id = ? AND chat_id = ?`, [listId, chatId]);
    if (lists.length === 0) return ctx.answerCbQuery('List not found.');

    await runQuery(`INSERT INTO persons (chat_id, list_id, name) VALUES (?, ?, ?)`, [chatId, listId, name]);
    ctx.answerCbQuery(`Added ${name}`);
    ctx.editMessageText(`Added ${name} to your "${lists[0].name}" list.`);
});

bot.command(['remove', 'removeperson'], async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const name = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!name) return ctx.reply('Please specify a name: /remove Inception');

    const items = await getQuery(`SELECT p.id, p.name, COALESCE(l.name, 'My Favorites') as list_name FROM persons p LEFT JOIN lists l ON p.list_id = l.id WHERE p.chat_id = ? AND p.name = ? COLLATE NOCASE`, [chatId, name]);

    if (items.length === 0) return ctx.reply(`Could not find "${name}" in your lists.`);

    if (items.length === 1) {
        await runQuery(`DELETE FROM scores WHERE person_id = ?`, [items[0].id]);
        await runQuery(`DELETE FROM persons WHERE id = ?`, [items[0].id]);
        return ctx.reply(`Removed ${name} from your list.`);
    }

    const buttons = items.map(i => Markup.button.callback(`From ` + i.list_name, `rmitem_${i.id}`));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    ctx.reply(`"${name}" is in multiple lists. Remove from which list?`, Markup.inlineKeyboard(rows));
});

bot.action(/rmitem_(\d+)/, async (ctx) => {
    const personId = ctx.match[1];
    await runQuery(`DELETE FROM scores WHERE person_id = ?`, [personId]);
    await runQuery(`DELETE FROM persons WHERE id = ?`, [personId]);
    ctx.answerCbQuery('Item removed');
    ctx.editMessageText('Item removed from the list.');
});

bot.command(['view', 'viewperson'], async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const name = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!name) return ctx.reply('Please specify a name: /view Inception');

    const persons = await getQuery(`SELECT p.id, p.name, COALESCE(l.name, 'My Favorites') as list_name FROM persons p LEFT JOIN lists l ON p.list_id = l.id WHERE p.chat_id = ? AND p.name = ? COLLATE NOCASE`, [chatId, name]);
    if (persons.length === 0) {
        return ctx.reply(`Could not find "${name}" in your lists.`);
    }

    let msg = '';
    for (let person of persons) {
        msg += `📊 *History for [${person.list_name}] ${person.name}*\n\n`;
        const scores = await getQuery(`SELECT score, date FROM scores WHERE person_id = ? ORDER BY date ASC`, [person.id]);
        if (scores.length === 0) {
            msg += `  No scores logged yet.\n\n`;
            continue;
        }
        for (let s of scores) {
            msg += `  - ${s.date}: ${s.score}/10\n`;
        }
        msg += `\n`;
    }

    const MAX_LEN = 4000;
    while (msg.length > 0) {
        await ctx.reply(msg.substring(0, MAX_LEN), { parse_mode: 'Markdown' });
        msg = msg.substring(MAX_LEN);
    }
});

bot.command('webapp', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const users = await getQuery(`SELECT web_token FROM users WHERE chat_id = ?`, [chatId]);
    if (users.length > 0) {
        let token = users[0].web_token;
        if (!token) {
            token = uuidv4();
            await runQuery(`UPDATE users SET web_token = ? WHERE chat_id = ?`, [token, chatId]);
        }
        const url = `${process.env.APP_URL || 'http://localhost:3000'}/?token=${token}`;
        ctx.reply(`Click here to open your Favorite Things Tracker dashboard:\n\n${url}`);
    } else {
        ctx.reply('Please use /start first to register.');
    }
});

bot.command('setcycle', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const parts = ctx.message.text.split(' ').slice(1);
    if (parts.length < 1) return ctx.reply('Usage: /setcycle [daily|weekly] [HH:MM] (e.g. /setcycle daily 18:00)');

    const type = parts[0].toLowerCase();
    const time = parts[1] || '20:00';
    if (!['daily', 'weekly'].includes(type)) return ctx.reply('Cycle must be either daily or weekly.');

    await runQuery(`UPDATE users SET cycle_type = ?, cycle_time = ? WHERE chat_id = ?`, [type, time, chatId]);
    ctx.reply(`Your notification cycle is set to ${type} at ${time}.`);
});

bot.command('scorenow', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    startScoringFlow(chatId, ctx);
});

async function startScoringFlow(chatId, ctx = null, date = null) {
    if (!date) {
        const d = new Date();
        date = d.toISOString().split('T')[0];
    }
    const persons = await getQuery(`
        SELECT p.id, p.name, COALESCE(l.name, 'My Favorites') as list_name 
        FROM persons p 
        LEFT JOIN lists l ON p.list_id = l.id 
        WHERE p.chat_id = ? 
        ORDER BY COALESCE(l.id, 0) ASC, p.id ASC
    `, [chatId]);

    if (persons.length === 0) {
        if (ctx) ctx.reply('You have nothing in your lists to score. Use /add to add something.');
        return;
    }

    await runQuery(`INSERT OR REPLACE INTO pending_scores (chat_id, person_index, date) VALUES (?, ?, ?)`, [chatId, 0, date]);

    const name = persons[0].name;
    const listName = persons[0].list_name;
    const msg = `It's time to score [${listName}] ${name} for ${date}! Reply with a score out of 10.`;

    if (ctx) {
        ctx.reply(msg);
    } else {
        bot.telegram.sendMessage(chatId, msg).catch(console.error);
    }
}

bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const pending = await getQuery(`SELECT * FROM pending_scores WHERE chat_id = ?`, [chatId]);
    if (pending.length > 0) {
        const state = pending[0];
        const score = parseFloat(text);
        if (isNaN(score) || score < 0 || score > 10) {
            return ctx.reply('Please enter a valid number between 0 and 10.');
        }

        const persons = await getQuery(`
            SELECT p.id, p.name, COALESCE(l.name, 'My Favorites') as list_name 
            FROM persons p 
            LEFT JOIN lists l ON p.list_id = l.id 
            WHERE p.chat_id = ? 
            ORDER BY COALESCE(l.id, 0) ASC, p.id ASC
        `, [chatId]);

        if (state.person_index < persons.length) {
            const personId = persons[state.person_index].id;
            // Save score
            // check existing
            const existing = await getQuery(`SELECT id FROM scores WHERE person_id = ? AND date = ?`, [personId, state.date]);
            if (existing.length > 0) {
                await runQuery(`UPDATE scores SET score = ? WHERE id = ?`, [score, existing[0].id]);
            } else {
                await runQuery(`INSERT INTO scores (person_id, score, date) VALUES (?, ?, ?)`, [personId, score, state.date]);
            }

            const nextIndex = state.person_index + 1;
            if (nextIndex < persons.length) {
                // Ask for next person
                await runQuery(`UPDATE pending_scores SET person_index = ? WHERE chat_id = ?`, [nextIndex, chatId]);
                ctx.reply(`Score saved! Now, what is the score for [${persons[nextIndex].list_name}] ${persons[nextIndex].name}? (Out of 10)`);
            } else {
                // Done
                await runQuery(`DELETE FROM pending_scores WHERE chat_id = ?`, [chatId]);
                ctx.reply('All scores saved! You can view your dashboard using /webapp');
            }
        } else {
            // Failsafe
            await runQuery(`DELETE FROM pending_scores WHERE chat_id = ?`, [chatId]);
        }
    }
});

module.exports = {
    bot,
    startScoringFlow
};
