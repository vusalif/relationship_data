const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        db.run(`CREATE TABLE IF NOT EXISTS users (
            chat_id TEXT PRIMARY KEY,
            username TEXT,
            web_token TEXT,
            cycle_type TEXT DEFAULT 'daily',
            cycle_time TEXT DEFAULT '20:00'
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS persons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT,
            list_id INTEGER,
            name TEXT,
            FOREIGN KEY(chat_id) REFERENCES users(chat_id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT,
            name TEXT,
            FOREIGN KEY(chat_id) REFERENCES users(chat_id)
        )`, () => {
            // Migration: Add list_id to existing persons if it doesn't exist
            db.all(`PRAGMA table_info(persons)`, (err, rows) => {
                if (!err && rows) {
                    const hasListId = rows.some(r => r.name === 'list_id');
                    if (!hasListId) {
                        db.run(`ALTER TABLE persons ADD COLUMN list_id INTEGER`);
                    }
                }
            });
        });

        db.run(`CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id INTEGER,
            score REAL,
            date TEXT,
            FOREIGN KEY(person_id) REFERENCES persons(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS pending_scores (
            chat_id TEXT PRIMARY KEY,
            list_id INTEGER,
            person_index INTEGER DEFAULT 0,
            date TEXT
        )`);
    }
});

module.exports = db;
