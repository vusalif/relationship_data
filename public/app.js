const colors = [
    '#e57373', '#f06292', '#ba68c8', '#9575cd', '#7986cb',
    '#64b5f6', '#4fc3f7', '#4dd0e1', '#4db6ac', '#81c784'
];

let state = {
    token: null,
    user: null,
    data: [],
    selectedPersonId: 'all',
    chart: null,
    avgChart: null
};

// Initialization
function init() {
    const urlParams = new URLSearchParams(window.location.search);
    let tokenStr = urlParams.get('token');

    if (tokenStr) {
        localStorage.setItem('auth_token', tokenStr);
        window.history.replaceState({}, document.title, window.location.pathname);
        state.token = tokenStr;
    } else {
        state.token = localStorage.getItem('auth_token');
    }

    if (state.token) {
        checkAuth();
    } else {
        showLogin();
    }

    setupEventListeners();
}

function showLogin() {
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
}

function showApp() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('username-display').innerText = state.user.username || 'Friend';
}

async function apiFetch(endpoint, method = 'GET', body = null) {
    const opts = {
        method,
        headers: {
            'Authorization': 'Bearer ' + state.token,
            'Content-Type': 'application/json'
        }
    };
    if (body) {
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(endpoint, opts);
    if (res.status === 401) {
        localStorage.removeItem('auth_token');
        showLogin();
        throw new Error('Unauthorized');
    }
    return res.json();
}

async function checkAuth() {
    try {
        state.user = await apiFetch('/api/me');
        showApp();
        loadData();
    } catch (e) {
        console.error(e);
    }
}

async function loadData() {
    state.data = await apiFetch('/api/data');
    renderSidebar();
    renderChart();
    renderDetailedAnalytics();
    renderEditScores();
}

function renderSidebar() {
    const list = document.getElementById('people-list');
    list.innerHTML = '';

    const filter = document.getElementById('person-filter');
    const oldFilterVal = filter.value;
    filter.innerHTML = '<option value="all">All Items</option>';

    state.data.forEach((p, idx) => {
        const li = document.createElement('li');
        li.className = 'person-item';
        if (state.selectedPersonId === p.id.toString()) {
            li.classList.add('active');
        }

        li.innerHTML = `
            <div style="display:flex; align-items:center;">
                <span style="color: ${colors[idx % colors.length]}; font-weight:bold; margin-right: 8px;">~</span>
                ${p.name}
            </div>
            <button class="delete-btn" data-id="${p.id}">&times;</button>
        `;

        li.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') {
                state.selectedPersonId = p.id.toString();
                filter.value = p.id;
                renderSidebar();
                renderChart();
                renderDetailedAnalytics();
                renderEditScores();
            }
        };

        const delBtn = li.querySelector('.delete-btn');
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Remove ${p.name}? All data will be lost.`)) {
                await apiFetch(`/api/person/${p.id}`, 'DELETE');
                if (state.selectedPersonId === p.id.toString()) state.selectedPersonId = 'all';
                loadData();
            }
        };

        list.appendChild(li);

        const opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = p.name;
        filter.appendChild(opt);
    });

    filter.value = state.selectedPersonId === 'all' ? 'all' : state.selectedPersonId;
}

function renderChart() {
    const ctx = document.getElementById('scoresChart').getContext('2d');

    if (state.chart) {
        state.chart.destroy();
    }

    // Get all unique dates
    const allDates = new Set();
    state.data.forEach(p => p.scores.forEach(s => allDates.add(s.date)));
    const labels = Array.from(allDates).sort();

    const datasets = state.data
        .filter(p => state.selectedPersonId === 'all' || p.id.toString() === state.selectedPersonId)
        .map((p, i) => {
            const dataMap = {};
            p.scores.forEach(s => dataMap[s.date] = s.score);
            const dataPoints = labels.map(l => dataMap[l] !== undefined ? dataMap[l] : null);

            return {
                label: p.name,
                data: dataPoints,
                borderColor: colors[i % colors.length],
                backgroundColor: colors[i % colors.length],
                tension: 0.3,
                borderWidth: 3,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointBackgroundColor: '#fff',
                pointBorderWidth: 2,
                spanGaps: true
            };
        });

    Chart.defaults.font.family = "'Schoolbell', cursive";
    state.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 0,
                    max: 10,
                    grid: { color: '#eaeaea', borderDash: [5, 5] },
                    ticks: { stepSize: 1 }
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: { size: 14 }
                    }
                }
            }
        }
    });
}

function renderDetailedAnalytics() {
    const statsContainer = document.getElementById('stats-container');
    const secondaryChartsContainer = document.getElementById('secondary-charts-container');

    // Clear out old data
    statsContainer.innerHTML = '';

    // Calculate aggregations based on filter
    let processedData = [];
    if (state.selectedPersonId === 'all') {
        processedData = state.data;
    } else {
        processedData = state.data.filter(p => p.id.toString() === state.selectedPersonId);
    }

    let totalScoresCount = 0;
    let sumOfAllScores = 0;
    let highestScore = 0;
    let lowestScore = 10;

    // Arrays for bar chart
    let averagesPerPerson = [];

    processedData.forEach(p => {
        let pSum = 0;
        let pCount = p.scores.length;

        p.scores.forEach(s => {
            pSum += s.score;
            totalScoresCount++;
            sumOfAllScores += s.score;
            if (s.score > highestScore) highestScore = s.score;
            if (s.score < lowestScore) lowestScore = s.score;
        });

        if (pCount > 0) {
            averagesPerPerson.push({
                name: p.name,
                avg: (pSum / pCount).toFixed(2)
            });
        }
    });

    const overallAvg = totalScoresCount > 0 ? (sumOfAllScores / totalScoresCount).toFixed(2) : '-';
    if (lowestScore === 10 && totalScoresCount === 0) lowestScore = '-';
    if (highestScore === 0 && totalScoresCount === 0) highestScore = '-';

    statsContainer.innerHTML = `
        <div class="stat-box">
            <div class="stat-label">Overall Average</div>
            <div class="stat-value">${overallAvg}</div>
        </div>
        <div class="stat-box">
            <div class="stat-label">Highest Score</div>
            <div class="stat-value">${highestScore}</div>
        </div>
        <div class="stat-box">
            <div class="stat-label">Lowest Score</div>
            <div class="stat-value">${lowestScore}</div>
        </div>
        <div class="stat-box">
            <div class="stat-label">Total Entries</div>
            <div class="stat-value">${totalScoresCount}</div>
        </div>
    `;

    // Only show secondary chart if 'all' is selected and there's data for comparison
    if (state.selectedPersonId === 'all' && averagesPerPerson.length > 0) {
        secondaryChartsContainer.classList.remove('hidden');
        renderBarChart(averagesPerPerson);
    } else {
        secondaryChartsContainer.classList.add('hidden');
    }
}

function renderBarChart(averagesData) {
    const ctx = document.getElementById('avgChart').getContext('2d');

    if (state.avgChart) {
        state.avgChart.destroy();
    }

    const labels = averagesData.map(d => d.name);
    const data = averagesData.map(d => parseFloat(d.avg));

    state.avgChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Average Score',
                data: data,
                backgroundColor: colors.slice(0, data.length),
                borderRadius: 5,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 10,
                    grid: { color: '#eaeaea', borderDash: [5, 5] },
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderEditScores() {
    const container = document.getElementById('edit-scores-container');

    if (state.selectedPersonId === 'all') {
        container.innerHTML = '<p class="text-muted small">Select a single item from the sidebar or dropdown to edit its scores.</p>';
        return;
    }

    const person = state.data.find(p => p.id.toString() === state.selectedPersonId);
    if (!person) return;

    if (person.scores.length === 0) {
        container.innerHTML = '<p class="text-muted small">No scores available yet.</p>';
        container.innerHTML += `<button id="add-manual-score" class="drawn-button action-btn mt-2">Add Score for Today</button>`;
        document.getElementById('add-manual-score').onclick = () => openModal(person, new Date().toISOString().split('T')[0], null);
        return;
    }

    let html = '<div class="edit-scores-list">';
    [...person.scores].reverse().forEach(s => {
        html += `
            <div class="score-box drawn-box" data-id="${s.id}" data-date="${s.date}" data-score="${s.score}">
                <div class="score-value">${s.score}</div>
                <div class="score-date">${s.date}</div>
            </div>
        `;
    });
    html += '</div>';

    html += `<button id="add-manual-score" class="drawn-button action-btn mt-2">Add Score</button>`;

    container.innerHTML = html;

    container.querySelectorAll('.score-box').forEach(box => {
        box.onclick = () => {
            openModal(person, box.dataset.date, box.dataset.score);
        };
    });

    document.getElementById('add-manual-score').onclick = () => {
        const today = new Date().toISOString().split('T')[0];
        openModal(person, today, '');
    };
}

function openModal(person, date, score) {
    document.getElementById('modal-person-name').innerText = person.name;
    document.getElementById('modal-person-id').value = person.id;

    // Check if score exists for date
    let existingDate = date;
    if (!score) {
        const existingInput = prompt('Enter date (YYYY-MM-DD):', date);
        if (!existingInput) return;
        existingDate = existingInput;
        const exists = person.scores.find(s => s.date === existingDate);
        if (exists) score = exists.score;
    }

    document.getElementById('modal-date').value = existingDate;
    document.getElementById('modal-score').value = score || '';

    document.getElementById('score-modal').classList.remove('hidden');
}

function setupEventListeners() {
    document.getElementById('add-person-btn').onclick = async () => {
        const nameInput = document.getElementById('new-person-name');
        const name = nameInput.value.trim();
        if (!name) return;

        await apiFetch('/api/person', 'POST', { name });
        nameInput.value = '';
        loadData();
    };

    document.getElementById('person-filter').onchange = (e) => {
        state.selectedPersonId = e.target.value;
        renderSidebar();
        renderChart();
        renderDetailedAnalytics();
        renderEditScores();
    };

    document.getElementById('close-modal-btn').onclick = () => {
        document.getElementById('score-modal').classList.add('hidden');
    };

    document.getElementById('save-score-btn').onclick = async () => {
        const person_id = document.getElementById('modal-person-id').value;
        const date = document.getElementById('modal-date').value;
        const score = parseFloat(document.getElementById('modal-score').value);

        if (isNaN(score) || score < 0 || score > 10) return alert('Score must be between 0 and 10');

        await apiFetch('/api/score', 'POST', { person_id, date, score });
        document.getElementById('score-modal').classList.add('hidden');
        loadData();
    };
}

init();
