/* =============================================
   ムキムキタスくん - タスク管理
   ============================================= */

// DOM要素
const criticalEl = document.getElementById("critical");
const highEl = document.getElementById("high");
const activeEl = document.getElementById("active");
const completedEl = document.getElementById("completed");

/**
 * タスクリスト読み込み
 */
async function loadList() {
    try {
        const res = await fetch(`${API_BASE}/list?user_id=${encodeURIComponent(userId)}`);
        if (!res.ok) throw new Error('API Error');
        renderList(await res.json());
    } catch (e) {
        console.error("タスク取得エラー:", e);
        renderList({ critical: [], high: [], active: [], completed: [] });
    }
}

/**
 * タスクリストをレンダリング
 */
function renderList(payload) {
    criticalEl.innerHTML = '';
    highEl.innerHTML = '';
    activeEl.innerHTML = '';
    completedEl.innerHTML = '';

    const critical = Array.isArray(payload.critical) ? payload.critical : [];
    const high = Array.isArray(payload.high) ? payload.high : [];
    const active = Array.isArray(payload.active) ? payload.active : [];
    const completed = Array.isArray(payload.completed) ? payload.completed : [];

    critical.forEach(t => { t.priority_level = 'critical'; criticalEl.appendChild(createTaskCard(t, false, 'critical')); });
    high.forEach(t => { t.priority_level = 'high'; highEl.appendChild(createTaskCard(t, false, 'high')); });
    active.forEach(t => { t.priority_level = t.priority_level || 'normal'; activeEl.appendChild(createTaskCard(t, false, t.priority_level)); });
    completed.forEach(t => completedEl.appendChild(createTaskCard(t, true, t.priority_level || 'normal')));
}

/**
 * タスクカードを作成（スワイプ機能付き）
 */
function createTaskCard(t, isCompleted, priority) {
    const wrap = document.createElement("div");
    wrap.className = `card priority-${priority}`;
    if (isCompleted) wrap.classList.add("completed");

    // アクションレール（左右のボタン）
    const rail = document.createElement("div");
    rail.className = "actions-rail";

    // 左側アクション（完了/未完了）
    const left = document.createElement("div");
    left.className = "actions-left";
    if (!isCompleted) {
        left.append(
            mkBtn("完了", () => action("complete", t.id), "btn-complete"),
            mkBtn("通知", () => openRemind(t), "btn-plus2h")
        );
    } else {
        left.append(mkBtn("未完", () => {
            if (checkTaskLimit()) action("uncomplete", t.id);
        }, "btn-complete"));
    }

    // 右側アクション
    const right = document.createElement("div");
    right.className = "actions-right";
    right.append(
        mkBtn("詳細", () => openDetail(t), "btn-detail"),
        mkBtn("優先", () => openPriorityModal(t), "btn-priority"),
        mkBtn("削除", () => action("delete", t.id), "btn-delete")
    );

    rail.append(left, right);

    // メインコンテンツ（スライド部分）
    const sl = document.createElement("div");
    sl.className = "sl";

    const leftBox = document.createElement("div");
    leftBox.style.cssText = "display:flex;align-items:center;gap:10px;flex:1;min-width:0;";

    // 優先順位バッジ
    if (priority === 'critical') {
        const badge = document.createElement("span");
        badge.className = "priority-badge";
        badge.textContent = "最重要";
        leftBox.appendChild(badge);
    } else if (priority === 'high') {
        const badge = document.createElement("span");
        badge.className = "priority-badge";
        badge.textContent = "重要";
        leftBox.appendChild(badge);
    }

    const titleEl = document.createElement("span");
    titleEl.className = "title";
    titleEl.textContent = t.task_name || t.title || "(無題)";
    titleEl.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    leftBox.appendChild(titleEl);

    const rightBox = document.createElement("div");
    rightBox.style.cssText = "display:flex;align-items:center;";

    // リマインド表示
    if (t.remind_at) {
        const remindEl = document.createElement("div");
        remindEl.className = "remindAt";
        remindEl.textContent = formatRemindLabel(t.remind_at);
        rightBox.appendChild(remindEl);
    }

    // ドラッグハンドル
    const handle = document.createElement("div");
    handle.className = "handle";
    handle.textContent = "☰";
    rightBox.appendChild(handle);

    sl.append(leftBox, rightBox);

    // === 展開詳細・編集パネル ===
    const editPanel = document.createElement("div");
    editPanel.className = "card-edit-panel";
    const taskName = t.task_name || t.title || "(無題)";
    const remindLabel = t.remind_at ? formatRemindLabel(t.remind_at) : '';
    const priorityLabel = priority === 'critical' ? '🔥 最重要' : priority === 'high' ? '⚡ 重要' : '';
    editPanel.innerHTML = `
        <div class="edit-detail-view">
            <div class="edit-detail-title">${taskName.replace(/</g, '&lt;')}</div>
            ${priorityLabel ? `<div class="edit-detail-meta">${priorityLabel}</div>` : ''}
            ${remindLabel ? `<div class="edit-detail-meta">${remindLabel}</div>` : ''}
            <button class="edit-btn edit-start">✏️ タスク名を編集</button>
        </div>
        <div class="edit-form-view" style="display:none;">
            <div class="edit-row">
                <input class="edit-input" type="text" value="${taskName.replace(/"/g, '&quot;')}" />
            </div>
            <div class="edit-actions">
                <button class="edit-btn edit-cancel">キャンセル</button>
                <button class="edit-btn edit-save">💪 保存</button>
            </div>
        </div>`;

    wrap.append(rail, sl, editPanel);

    // パネル内の要素取得
    const detailView = editPanel.querySelector('.edit-detail-view');
    const formView = editPanel.querySelector('.edit-form-view');
    const editInput = editPanel.querySelector('.edit-input');

    // 「編集」ボタン → フォーム表示
    editPanel.querySelector('.edit-start').addEventListener('click', (e) => {
        e.stopPropagation();
        detailView.style.display = 'none';
        formView.style.display = 'block';
        editInput.value = taskName;
        setTimeout(() => editInput.focus(), 50);
    });

    // 「保存」ボタン
    editPanel.querySelector('.edit-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        const newTitle = editInput.value.trim();
        if (newTitle && newTitle !== taskName) {
            await action("rename", t.id, { task_name: newTitle });
        } else {
            wrap.classList.remove('expanded');
            detailView.style.display = '';
            formView.style.display = 'none';
        }
    });

    // 「キャンセル」ボタン
    editPanel.querySelector('.edit-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        editInput.value = taskName;
        detailView.style.display = '';
        formView.style.display = 'none';
    });

    // パネル内イベント伝播停止
    editPanel.addEventListener('click', (e) => e.stopPropagation());
    editPanel.addEventListener('pointerdown', (e) => e.stopPropagation());

    // === 改良版スワイプ機能を適用 ===
    applySwipeToCard(wrap, t, isCompleted, (actionType, taskId) => {
        if (actionType === 'complete') {
            action("complete", taskId);
        } else if (actionType === 'uncomplete') {
            if (checkTaskLimit()) action("uncomplete", taskId);
        } else if (actionType === 'delete') {
            action("delete", taskId);
        }
    });

    // === ドラッグ（並び替え）===
    setupDragHandle(handle, wrap, sl, t);

    // === タップで展開（スワイプ中は無視）===
    sl.addEventListener('click', (e) => {
        if (e.target.closest('.handle') || e.target.closest('button')) return;
        if (wrap.classList.contains('open-left') || wrap.classList.contains('open-right')) return;

        // 他の展開中カードを閉じる
        document.querySelectorAll('.card.expanded').forEach(c => {
            if (c !== wrap) c.classList.remove('expanded');
        });

        const isExpanding = !wrap.classList.contains('expanded');
        wrap.classList.toggle('expanded');

        if (isExpanding) {
            // 展開時は詳細ビューをリセット
            detailView.style.display = '';
            formView.style.display = 'none';
            editInput.value = taskName;
        }
    });

    // タスクデータを保持
    wrap.__taskData = t;
    wrap.dataset.taskId = t.id;

    return wrap;
}

/**
 * ドラッグハンドルのセットアップ
 */
function setupDragHandle(handle, wrap, sl, t) {
    const startDrag = (startEvent) => {
        startEvent.preventDefault();
        startEvent.stopPropagation();

        const card = wrap;
        const list = card.parentElement;
        if (!list) return;

        isDraggingCard = true;
        closeAllSwipeRows(); // 開いているスワイプを閉じる

        card.classList.remove("open-left", "open-right");
        sl.style.transition = "none";
        sl.style.transform = "translateX(0)";

        const cardRect = card.getBoundingClientRect();
        const dragStartY = startEvent.clientY || (startEvent.touches && startEvent.touches[0].clientY);
        const cardStartTop = cardRect.top;
        const cardHeight = cardRect.height;
        const cardWidth = cardRect.width;

        // ドラッグ用クローン
        const dragClone = card.cloneNode(true);
        dragClone.style.cssText = `position:fixed;left:${cardRect.left}px;top:${cardRect.top}px;width:${cardWidth}px;height:${cardHeight}px;pointer-events:none;z-index:1000;opacity:0.95;box-shadow:0 8px 20px rgba(0,0,0,0.3);transition:none;`;
        dragClone.classList.add("dragging");
        document.body.appendChild(dragClone);

        card.style.opacity = "0.3";
        card.style.transition = "none";
        document.body.style.userSelect = "none";

        const getY = ev => ev.touches?.length ? ev.touches[0].clientY : ev.clientY;

        const updatePosition = (y) => {
            const deltaY = y - dragStartY;
            dragClone.style.top = (cardStartTop + deltaY) + "px";

            const cloneCenterY = cardStartTop + deltaY + cardHeight / 2;
            const siblings = Array.from(list.querySelectorAll(".card"));

            for (const sibling of siblings) {
                if (sibling === card) continue;
                const siblingRect = sibling.getBoundingClientRect();
                if (cloneCenterY < siblingRect.top + siblingRect.height / 2) {
                    if (card.nextSibling !== sibling) list.insertBefore(card, sibling);
                    return;
                }
            }
            if (list.lastElementChild !== card) list.appendChild(card);
        };

        const onMove = ev => {
            ev.preventDefault();
            updatePosition(getY(ev));
        };

        const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("touchmove", onMove);
            document.removeEventListener("touchend", onUp);

            dragClone.remove();
            card.style.opacity = "";
            card.style.transition = "";
            card.classList.remove("open-left", "open-right");

            const slEl = card.querySelector(".sl");
            if (slEl) {
                slEl.style.transition = "";
                slEl.style.transform = "translateX(0)";
            }

            document.body.style.userSelect = "";
            setTimeout(() => isDraggingCard = false, 50);
            saveSortOrder();
        };

        document.addEventListener("pointermove", onMove, { passive: false });
        document.addEventListener("pointerup", onUp);
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onUp);
    };

    handle.addEventListener("pointerdown", e => { e.preventDefault(); startDrag(e); });
    handle.addEventListener("touchstart", e => { e.preventDefault(); e.stopPropagation(); startDrag(e); }, { passive: false });
}

/**
 * 並び順保存
 */
async function saveSortOrder() {
    if (!userId) return;
    const orders = [];
    [criticalEl, highEl, activeEl, completedEl].forEach((listEl, idx) => {
        const section = ['critical', 'high', 'active', 'completed'][idx];
        listEl.querySelectorAll('.card').forEach((card, index) => {
            const t = card.__taskData;
            if (t) orders.push({ id: t.id, sort_order: index, section });
        });
    });
    if (orders.length) await action("sort_update", null, { orders });
}

/**
 * タスク追加
 */
async function addTask() {
    const input = document.getElementById('newTitle');
    const title = input.value.trim();
    if (!title) return;

    if (!checkTaskLimit()) return;

    await action("create", null, { task_name: title });
    input.value = "";
}

/**
 * 現在の未完了タスク数を取得
 */
function getTodoCount() {
    const criticalCount = criticalEl.querySelectorAll('.card:not(.completed)').length;
    const highCount = highEl.querySelectorAll('.card:not(.completed)').length;
    const activeCount = activeEl.querySelectorAll('.card:not(.completed)').length;
    return criticalCount + highCount + activeCount;
}

/**
 * タスク枠制限チェック
 */
function checkTaskLimit() {
    const taskLimit = currentEntitlements?.task_limit ?? 3;
    const role = currentEntitlements?.role || 'user';

    // developer/adminは制限なし
    if (role === 'developer' || role === 'admin') {
        return true;
    }

    const currentCount = getTodoCount();
    if (currentCount >= taskLimit) {
        showUpgradeModal('TODO枠');
        return false;
    }
    return true;
}

/**
 * ボタン作成ヘルパー
 */
function mkBtn(label, onClick, cls) {
    const b = document.createElement("button");
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener("click", e => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
    });
    return b;
}
