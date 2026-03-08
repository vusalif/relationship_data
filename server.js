const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

function runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

// Authentication middleware
async function authUser(req, res, next) {
    const token = req.headers.authorization || req.query.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const users = await getQuery(`SELECT * FROM users WHERE web_token = ?`, [token.replace('Bearer ', '')]);
        if (users.length === 0) return res.status(401).json({ error: 'Invalid token' });
        req.user = users[0];
        next();
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
}

app.get('/api/me', authUser, (req, res) => {
    res.json(req.user);
});

app.get('/api/data', authUser, async (req, res) => {
    try {
        const persons = await getQuery(`SELECT id, name FROM persons WHERE chat_id = ?`, [req.user.chat_id]);

        for (let p of persons) {
            p.scores = await getQuery(`SELECT id, score, date FROM scores WHERE person_id = ? ORDER BY date ASC`, [p.id]);
        }
        res.json(persons);
    } catch (e) {
        res.status(500).json({ error: 'Server error', message: e.message });
    }
});

app.post('/api/person', authUser, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const result = await runQuery(`INSERT INTO persons (chat_id, name) VALUES (?, ?)`, [req.user.chat_id, name]);
        res.json({ id: result.id, name });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/person/:id', authUser, async (req, res) => {
    try {
        await runQuery(`DELETE FROM scores WHERE person_id = ?`, [req.params.id]);
        await runQuery(`DELETE FROM persons WHERE id = ? AND chat_id = ?`, [req.params.id, req.user.chat_id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/score', authUser, async (req, res) => {
    const { person_id, score, date } = req.body;
    if (person_id == null || score == null || !date) return res.status(400).json({ error: 'Missing fields' });
    try {
        // Find existing score for date
        const existing = await getQuery(`SELECT id FROM scores WHERE person_id = ? AND date = ?`, [person_id, date]);
        if (existing.length > 0) {
            await runQuery(`UPDATE scores SET score = ? WHERE id = ?`, [score, existing[0].id]);
        } else {
            await runQuery(`INSERT INTO scores (person_id, score, date) VALUES (?, ?, ?)`, [person_id, score, date]);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = app;
