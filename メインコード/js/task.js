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
        const res = await fetch(`${API_BASE}/tasks?user_id=${encodeURIComponent(userId)}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        renderTasks(data.tasks || []);
    } catch (e) {
        console.error("タスク取得エラー:", e);
        [criticalEl, highEl, activeEl, completedEl].forEach(el => el.innerHTML = '');
    }
}

/**
 * タスクリストをレンダリング
 */
function renderTasks(tasks) {
    criticalEl.innerHTML = '';
    highEl.innerHTML = '';
    activeEl.innerHTML = '';
    completedEl.innerHTML = '';

    tasks.forEach(t => {
        const isCompleted = t.status === 'completed';
        const priority = t.priority_level || 'normal';
        const card = createTaskCard(t, isCompleted, priority);

        if (isCompleted) {
            completedEl.appendChild(card);
        } else if (priority === 'critical') {
            criticalEl.appendChild(card);
        } else if (priority === 'high') {
            highEl.appendChild(card);
        } else {
            activeEl.appendChild(card);
        }
    });
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
    if (isCompleted) {
        left.appendChild(mkBtn("↩ 戻す", () => {
            if (checkTaskLimit()) action("uncomplete", t.id);
        }, "btn-complete"));
    } else {
        left.appendChild(mkBtn("✓ 完了", () => action("complete", t.id), "btn-complete"));
    }

    // 右側アクション
    const right = document.createElement("div");
    right.className = "actions-right";
    if (!isCompleted) {
        right.appendChild(mkBtn("⏰+2h", () => action("remind_2h", t.id), "btn-plus2h"));
        right.appendChild(mkBtn("📋", () => openDetail(t), "btn-detail"));
        right.appendChild(mkBtn("⚡", () => openPriorityModal(t), "btn-priority"));
    }
    right.appendChild(mkBtn("🗑", () => action("delete", t.id), "btn-delete"));

    rail.append(left, right);

    // メインコンテンツ（スライド部分）
    const sl = document.createElement("div");
    sl.className = "sl";

    const leftBox = document.createElement("div");
    leftBox.style.cssText = "display:flex;align-items:center;gap:10px;flex:1;min-width:0;";

    // 優先順位バッジ
    if (priority !== 'normal') {
        const badge = document.createElement("span");
        badge.className = "priority-badge";
        badge.textContent = priority === 'critical' ? '緊急' : '重要';
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
    wrap.append(rail, sl);

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
    const input = document.getElementById("newTitle");
    const title = input.value.trim();
    if (!title) return;

    // タスク枠制限チェック
    if (!checkTaskLimit()) return;

    try {
        await fetch(`${API_BASE}/tasks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, title })
        });
        input.value = "";
        await loadList();
    } catch (e) {
        alert("タスク追加に失敗しました");
    }
}

/**
 * タスク枠制限チェック
 */
function checkTaskLimit() {
    if (!currentEntitlements) return true;

    const activeCount = criticalEl.children.length + highEl.children.length + activeEl.children.length;

    if (activeCount >= currentEntitlements.task_limit) {
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
