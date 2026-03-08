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
            name TEXT,
            FOREIGN KEY(chat_id) REFERENCES users(chat_id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id INTEGER,
            score REAL,
            date TEXT,
            FOREIGN KEY(person_id) REFERENCES persons(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS pending_scores (
            chat_id TEXT PRIMARY KEY,
            person_index INTEGER DEFAULT 0,
            date TEXT
        )`);
    }
});

module.exports = db;
