/* =============================================
   ムキムキタスくん - 習慣管理
   ============================================= */

let todayHabits = {};
let weekHabitsData = {};

/**
 * 習慣リストをレンダリング
 */
function renderHabitList() {
    const container = document.getElementById('habitList');
    container.innerHTML = HABITS.map(h =>
        `<div class="habit-item" data-habit="${h.id}">
            <div class="habit-checkbox" data-habit="${h.id}"></div>
            <span class="habit-name">${h.name}</span>
            <span class="habit-icon">${h.icon}</span>
        </div>`
    ).join('');

    container.querySelectorAll('.habit-item').forEach(item => {
        item.addEventListener('click', e => {
            e.stopPropagation();
            const id = item.dataset.habit;
            const cb = item.querySelector('.habit-checkbox');
            todayHabits[id] = !todayHabits[id];
            cb.classList.toggle('checked', todayHabits[id]);
            cb.textContent = todayHabits[id] ? '✓' : '';
            item.classList.toggle('checked', todayHabits[id]);
        });
    });
}

/**
 * 習慣データ読み込み
 */
async function loadHabits() {
    try {
        const res = await fetch(`${API_BASE}/habits?user_id=${encodeURIComponent(userId)}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        weekHabitsData = data.week || {};
        todayHabits = data.today || {};
        renderWeekView();
        renderHabitAnalysis(data);
        updateHabitCheckboxes();
    } catch (e) {
        console.error("習慣データ取得エラー:", e);
        weekHabitsData = {};
        todayHabits = {};
        renderWeekView();
        renderHabitAnalysis({ week_progress: 0 });
        updateHabitCheckboxes();
    }
}

/**
 * 習慣チェックボックス更新
 */
function updateHabitCheckboxes() {
    document.querySelectorAll('.habit-item').forEach(item => {
        const id = item.dataset.habit;
        const cb = item.querySelector('.habit-checkbox');
        const isChecked = !!todayHabits[id];
        cb.classList.toggle('checked', isChecked);
        cb.textContent = isChecked ? '✓' : '';
        item.classList.toggle('checked', isChecked);
    });
}

/**
 * 週間ビューレンダリング
 */
function renderWeekView() {
    const tbody = document.getElementById('weekTableBody');
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    tbody.innerHTML = HABITS.map(h =>
        `<tr>
            <td>${h.icon} ${h.name}</td>
            ${days.map(d =>
                `<td class="${weekHabitsData[d]?.[h.id] ? 'checked' : 'unchecked'}">
                    ${weekHabitsData[d]?.[h.id] ? '●' : '○'}
                </td>`
            ).join('')}
        </tr>`
    ).join('');
}

/**
 * 習慣分析レンダリング
 */
function renderHabitAnalysis(data) {
    const progress = data.week_progress || 0;
    document.getElementById('weekProgressValue').textContent = `${progress}%`;
    document.getElementById('weekProgressBar').style.width = `${progress}%`;
}

/**
 * 習慣データ保存
 */
async function saveHabits() {
    try {
        const today = new Date();
        const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        await fetch(`${API_BASE}/habits/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, date: localDate, habits: todayHabits })
        });
        document.getElementById('dailyTaskCard').classList.remove('expanded');
        await loadHabits();
        alert('💪 記録を保存しました！');
    } catch (e) {
        alert('保存に失敗しました');
    }
}

// === 月間分析 ===
let selectedMonth = new Date();
let monthlyChart = null;

/**
 * 月間分析UI初期化
 */
function bindMonthlyAnalysisUI() {
    const modal = document.getElementById('monthlyAnalysisModal');
    const close = () => modal.classList.remove('visible');

    document.getElementById('openMonthlyAnalysis').onclick = () => {
        selectedMonth = new Date();
        modal.classList.add('visible');
        loadMonthlyData();
    };
    document.getElementById('monthlyAnalysisBackdrop').onclick = close;
    document.getElementById('closeMonthlyAnalysis').onclick = close;

    document.getElementById('prevMonthBtn').onclick = () => {
        selectedMonth.setMonth(selectedMonth.getMonth() - 1);
        loadMonthlyData();
    };
    document.getElementById('nextMonthBtn').onclick = () => {
        const now = new Date();
        if (selectedMonth.getFullYear() < now.getFullYear() ||
            (selectedMonth.getFullYear() === now.getFullYear() && selectedMonth.getMonth() < now.getMonth())) {
            selectedMonth.setMonth(selectedMonth.getMonth() + 1);
            loadMonthlyData();
        }
    };
}

/**
 * 月間データ読み込み
 */
async function loadMonthlyData() {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    document.getElementById('currentMonthLabel').textContent = `${year}年${month}月`;

    try {
        const res = await fetch(`${API_BASE}/habits/monthly?user_id=${encodeURIComponent(userId)}&year=${year}&month=${month}`);
        if (!res.ok) throw new Error();
        renderMonthlyAnalysis(await res.json());
    } catch (e) {
        renderMonthlyAnalysis({ days: {} });
    }
}

/**
 * 月間分析レンダリング
 */
function renderMonthlyAnalysis(data) {
    const days = data.days || {};
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();

    let totalChecks = 0, totalPossible = 0, currentStreak = 0, bestStreak = 0;
    const dailyRates = [];

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayData = days[dateStr];

        if (dayData && Object.keys(dayData).length > 0) {
            const checked = Object.values(dayData).filter(v => v).length;
            totalChecks += checked;
            totalPossible += 6;
            currentStreak++;
            bestStreak = Math.max(bestStreak, currentStreak);
            dailyRates.push({ day: d, rate: Math.round((checked / 6) * 100) });
        } else {
            currentStreak = 0;
            dailyRates.push({ day: d, rate: 0 });
        }
    }

    document.getElementById('monthlyTotalDays').textContent =
        Object.keys(days).filter(k => Object.values(days[k] || {}).some(v => v)).length;
    document.getElementById('monthlyAchievement').textContent =
        `${totalPossible ? Math.round((totalChecks / totalPossible) * 100) : 0}%`;
    document.getElementById('monthlyBestStreak').textContent = bestStreak;

    // テーブル
    const tbody = document.getElementById('monthlyTableBody');
    tbody.innerHTML = Array.from({ length: daysInMonth }, (_, i) => {
        const d = i + 1;
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayData = days[dateStr];
        const dow = ['日','月','火','水','木','金','土'][new Date(dateStr).getDay()];
        const cells = HABITS.map(h =>
            `<td class="${dayData?.[h.id] ? 'cell-check' : 'cell-uncheck'}">${dayData?.[h.id] ? '●' : '○'}</td>`
        ).join('');
        const dayChecked = dayData ? Object.values(dayData).filter(v => v).length : 0;
        return `<tr><td>${month}/${d}(${dow})</td>${cells}<td>${dayChecked}/6</td></tr>`;
    }).join('');

    // チャート
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    if (monthlyChart) monthlyChart.destroy();

    monthlyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dailyRates.map(d => `${d.day}日`),
            datasets: [{
                label: '達成率',
                data: dailyRates.map(d => d.rate),
                borderColor: '#ff9f43',
                backgroundColor: 'rgba(255,159,67,0.15)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#ff9f43'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100, ticks: { stepSize: 25, callback: v => `${v}%` } },
                x: { ticks: { maxTicksLimit: 10 } }
            },
            plugins: { legend: { display: false } }
        }
    });
}
