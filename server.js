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
        let lists = await getQuery(`SELECT id, name FROM lists WHERE chat_id = ?`, [req.user.chat_id]);

        // Migrate items without list
        const personsWithoutList = await getQuery(`SELECT id FROM persons WHERE chat_id = ? AND (list_id IS NULL OR list_id = 0)`, [req.user.chat_id]);
        if (personsWithoutList.length > 0) {
            let defaultList = lists.find(l => l.name === 'My Favorites');
            if (!defaultList) {
                const result = await runQuery(`INSERT INTO lists (chat_id, name) VALUES (?, ?)`, [req.user.chat_id, 'My Favorites']);
                defaultList = { id: result.id, name: 'My Favorites' };
                lists.push(defaultList);
            }
            await runQuery(`UPDATE persons SET list_id = ? WHERE chat_id = ? AND (list_id IS NULL OR list_id = 0)`, [defaultList.id, req.user.chat_id]);
        }

        // Always ensure at least one list exists
        if (lists.length === 0) {
            const result = await runQuery(`INSERT INTO lists (chat_id, name) VALUES (?, ?)`, [req.user.chat_id, 'My Favorites']);
            lists.push({ id: result.id, name: 'My Favorites' });
        }

        // Fetch items and scores for each list
        for (let l of lists) {
            l.items = await getQuery(`SELECT id, name FROM persons WHERE chat_id = ? AND list_id = ? ORDER BY id ASC`, [req.user.chat_id, l.id]);
            for (let p of l.items) {
                p.scores = await getQuery(`SELECT id, score, date FROM scores WHERE person_id = ? ORDER BY date ASC`, [p.id]);
            }
        }

        res.json(lists);
    } catch (e) {
        res.status(500).json({ error: 'Server error', message: e.message });
    }
});

app.post('/api/list', authUser, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const result = await runQuery(`INSERT INTO lists (chat_id, name) VALUES (?, ?)`, [req.user.chat_id, name]);
        res.json({ id: result.id, name });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/list/:id', authUser, async (req, res) => {
    try {
        const items = await getQuery(`SELECT id FROM persons WHERE list_id = ? AND chat_id = ?`, [req.params.id, req.user.chat_id]);
        for (let item of items) {
            await runQuery(`DELETE FROM scores WHERE person_id = ?`, [item.id]);
        }
        await runQuery(`DELETE FROM persons WHERE list_id = ? AND chat_id = ?`, [req.params.id, req.user.chat_id]);
        await runQuery(`DELETE FROM lists WHERE id = ? AND chat_id = ?`, [req.params.id, req.user.chat_id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/person', authUser, async (req, res) => {
    const { name, list_id } = req.body;
    if (!name || list_id == null) return res.status(400).json({ error: 'Name and list_id are required' });
    try {
        const lists = await getQuery(`SELECT id FROM lists WHERE id = ? AND chat_id = ?`, [list_id, req.user.chat_id]);
        if (lists.length === 0) return res.status(400).json({ error: 'Invalid list' });

        const result = await runQuery(`INSERT INTO persons (chat_id, list_id, name) VALUES (?, ?, ?)`, [req.user.chat_id, list_id, name]);
        res.json({ id: result.id, name, list_id });
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
