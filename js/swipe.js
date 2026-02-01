/* =============================================
   ムキムキタスくん - スワイプ機能（iPhone純正品質）
   ============================================= */

/**
 * SwipeableRow - タスクカードの横スワイプを管理するクラス
 *
 * iPhone純正アプリ（Mail等）と同等の操作感を実現：
 * - 縦スクロールとの競合を適切に解決
 * - 指追従の自然さ（rAFベース）
 * - ラバーバンド効果（上限超過時の減衰）
 * - 速度ベースのスナップ判定
 * - 1つだけ開く状態管理
 * - 外側タップで閉じる
 */

// 現在開いているカードをグローバルに1つだけ管理
let currentOpenRow = null;

// ドラッグ中フラグ（並び替えとの競合防止）
let isDraggingCard = false;

/**
 * SwipeableRowクラス
 */
class SwipeableRow {
    constructor(element, options = {}) {
        this.wrap = element;
        this.sl = element.querySelector('.sl');
        this.actionsLeft = element.querySelector('.actions-left');
        this.actionsRight = element.querySelector('.actions-right');

        // オプション設定
        this.options = {
            onAction: options.onAction || (() => {}),
            taskData: options.taskData || null,
            isCompleted: options.isCompleted || false,
        };

        // 状態
        this.state = 'closed'; // 'closed' | 'open-left' | 'open-right'
        this.isLocked = false; // 横スワイプにロックされたか
        this.isScrolling = null; // 縦スクロール中か（null = 未判定）

        // 座標・速度
        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.lastX = 0;
        this.velocitySamples = [];
        this.lastMoveTime = 0;

        // ボタン幅（実測）
        this.leftWidth = 0;
        this.rightWidth = 0;

        // rAF
        this.rafId = null;
        this.pendingX = null;

        // タップ判定
        this.hasMoved = false;

        this._init();
    }

    _init() {
        // ボタン幅を測定
        requestAnimationFrame(() => {
            this.leftWidth = this.actionsLeft?.getBoundingClientRect().width || 140;
            this.rightWidth = this.actionsRight?.getBoundingClientRect().width || 140;
        });

        // イベントリスナー設定（Pointer Events優先）
        if (window.PointerEvent) {
            this.wrap.addEventListener('pointerdown', this._onPointerDown.bind(this), { passive: true });
            this.wrap.addEventListener('pointermove', this._onPointerMove.bind(this), { passive: false });
            this.wrap.addEventListener('pointerup', this._onPointerUp.bind(this));
            this.wrap.addEventListener('pointercancel', this._onPointerUp.bind(this));
        } else {
            // Touch fallback
            this.wrap.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: true });
            this.wrap.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
            this.wrap.addEventListener('touchend', this._onTouchEnd.bind(this));
            this.wrap.addEventListener('touchcancel', this._onTouchEnd.bind(this));
        }

        // クリック抑制
        this.wrap.addEventListener('click', this._onClick.bind(this), true);
    }

    // === Pointer Events ===
    _onPointerDown(e) {
        if (isDraggingCard || e.target.closest('button') || e.target.closest('.handle')) return;

        // 他の開いているカードを閉じる
        if (currentOpenRow && currentOpenRow !== this) {
            currentOpenRow.close();
        }

        this._startGesture(e.clientX, e.clientY, e.pointerId);
    }

    _onPointerMove(e) {
        if (!this.isActive) return;
        this._moveGesture(e.clientX, e.clientY, e);
    }

    _onPointerUp(e) {
        if (!this.isActive) return;
        this._endGesture();
    }

    // === Touch Events (fallback) ===
    _onTouchStart(e) {
        if (isDraggingCard || e.target.closest('button') || e.target.closest('.handle')) return;
        if (!e.touches.length) return;

        // 他の開いているカードを閉じる
        if (currentOpenRow && currentOpenRow !== this) {
            currentOpenRow.close();
        }

        this._startGesture(e.touches[0].clientX, e.touches[0].clientY);
    }

    _onTouchMove(e) {
        if (!this.isActive || !e.touches.length) return;
        this._moveGesture(e.touches[0].clientX, e.touches[0].clientY, e);
    }

    _onTouchEnd(e) {
        if (!this.isActive) return;
        this._endGesture();
    }

    // === ジェスチャー処理 ===
    _startGesture(x, y, pointerId = null) {
        this.isActive = true;
        this.startX = x;
        this.startY = y;
        this.currentX = 0;
        this.lastX = 0;
        this.isLocked = false;
        this.isScrolling = null;
        this.hasMoved = false;
        this.velocitySamples = [];
        this.lastMoveTime = performance.now();

        // Pointer Captureを試みる
        if (pointerId && this.wrap.setPointerCapture) {
            try {
                this.wrap.setPointerCapture(pointerId);
            } catch (e) {}
        }

        // transition無効化（指追従モード）
        this.sl.style.transition = 'none';
    }

    _moveGesture(x, y, event) {
        const dx = x - this.startX;
        const dy = y - this.startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // === 縦スクロール vs 横スワイプの判定（最重要）===
        if (this.isScrolling === null) {
            // まだ判定前
            if (absDx > SWIPE_CONFIG.LOCK_THRESHOLD || absDy > SWIPE_CONFIG.LOCK_THRESHOLD) {
                // 判定：横成分が縦成分の1.2倍以上なら横スワイプ
                if (absDx > absDy * SWIPE_CONFIG.LOCK_ANGLE_RATIO) {
                    this.isScrolling = false; // 横スワイプ確定
                    this.isLocked = true;
                } else {
                    this.isScrolling = true; // 縦スクロール確定
                }
            }
        }

        // 縦スクロール中は何もしない（ブラウザに任せる）
        if (this.isScrolling === true) {
            return;
        }

        // 横スワイプ確定後
        if (this.isLocked) {
            // preventDefaultでスクロールを止める
            if (event && event.cancelable) {
                event.preventDefault();
            }

            this.hasMoved = true;

            // 速度計算用サンプル記録
            const now = performance.now();
            this.velocitySamples.push({ x: dx, time: now });
            if (this.velocitySamples.length > SWIPE_CONFIG.VELOCITY_SAMPLE_COUNT) {
                this.velocitySamples.shift();
            }
            this.lastMoveTime = now;

            // ラバーバンド効果を適用した移動量を計算
            this.currentX = this._applyRubberBand(dx);

            // rAFで描画更新（フレーム落ち防止）
            this._scheduleUpdate();
        }
    }

    _endGesture() {
        this.isActive = false;

        // rAFキャンセル
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        // 縦スクロールだった場合は何もしない
        if (this.isScrolling === true) {
            this.sl.style.transition = '';
            this.sl.style.transform = 'translateX(0)';
            return;
        }

        // 移動量が小さい場合は閉じる
        if (!this.hasMoved || Math.abs(this.currentX) < SWIPE_CONFIG.TAP_SLOP) {
            this._snapTo(0);
            return;
        }

        // 速度を計算
        const velocity = this._calculateVelocity();

        // スナップ先を決定
        this._determineSnapTarget(velocity);
    }

    // === ラバーバンド効果 ===
    _applyRubberBand(dx) {
        const leftLimit = this.leftWidth;
        const rightLimit = -this.rightWidth;

        if (dx > leftLimit) {
            // 左方向の上限超過（完了ボタン側）
            const overflow = dx - leftLimit;
            return leftLimit + overflow * SWIPE_CONFIG.RUBBER_BAND_FACTOR;
        } else if (dx < rightLimit) {
            // 右方向の上限超過（削除ボタン側）
            const overflow = dx - rightLimit;
            return rightLimit + overflow * SWIPE_CONFIG.RUBBER_BAND_FACTOR;
        }

        return dx;
    }

    // === rAFによる描画更新 ===
    _scheduleUpdate() {
        if (this.rafId) return;

        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            this.sl.style.transform = `translateX(${this.currentX}px)`;
        });
    }

    // === 速度計算 ===
    _calculateVelocity() {
        if (this.velocitySamples.length < 2) return 0;

        const first = this.velocitySamples[0];
        const last = this.velocitySamples[this.velocitySamples.length - 1];
        const dt = last.time - first.time;

        if (dt <= 0) return 0;

        return (last.x - first.x) / dt; // px/ms
    }

    // === スナップ先決定 ===
    _determineSnapTarget(velocity) {
        const dx = this.currentX;
        const leftThreshold = this.leftWidth * SWIPE_CONFIG.SNAP_THRESHOLD_RATIO;
        const rightThreshold = this.rightWidth * SWIPE_CONFIG.SNAP_THRESHOLD_RATIO;
        const velocityThreshold = SWIPE_CONFIG.VELOCITY_THRESHOLD;
        const screenW = window.innerWidth;

        // フルスワイプアクション判定（距離ベース）
        if (dx > this.leftWidth * SWIPE_CONFIG.FULL_SWIPE_RATIO) {
            this._flyOff(screenW, 'complete');
            return;
        }
        if (dx < -this.rightWidth * SWIPE_CONFIG.FULL_SWIPE_RATIO) {
            this._flyOff(-screenW, 'delete');
            return;
        }

        // 高速フリックによるフルスワイプ判定
        if (Math.abs(velocity) > velocityThreshold * 2) {
            if (velocity > 0) {
                this._flyOff(screenW, 'complete');
            } else {
                this._flyOff(-screenW, 'delete');
            }
            return;
        }

        // 速度優先判定（通常フリック → ボタン表示）
        if (Math.abs(velocity) > velocityThreshold) {
            if (velocity > 0) {
                this._openLeft();
            } else {
                this._openRight();
            }
            return;
        }

        // 距離判定
        if (dx > leftThreshold) {
            this._openLeft();
        } else if (dx < -rightThreshold) {
            this._openRight();
        } else {
            this.close();
        }
    }

    // === フルスワイプ飛び出しアニメーション ===
    _flyOff(targetX, actionType) {
        this.sl.style.transition = `transform 250ms ${SWIPE_CONFIG.SNAP_EASING}`;
        this.sl.style.transform = `translateX(${targetX}px)`;

        const onEnd = () => {
            this.sl.removeEventListener('transitionend', onEnd);
            this._executeAction(actionType);
            // アクション後にリストが再描画されるのでリセット不要
        };
        this.sl.addEventListener('transitionend', onEnd);

        // fallback
        setTimeout(() => {
            this._executeAction(actionType);
        }, 300);

        // 二重実行防止
        let executed = false;
        const originalExecute = this._executeAction.bind(this);
        this._executeAction = (type) => {
            if (executed) return;
            executed = true;
            originalExecute(type);
        };
    }

    // === 状態変更 ===
    _openLeft() {
        this.state = 'open-left';
        this.wrap.classList.add('open-left');
        this.wrap.classList.remove('open-right');
        currentOpenRow = this;
        this._snapTo(this.leftWidth);
    }

    _openRight() {
        this.state = 'open-right';
        this.wrap.classList.add('open-right');
        this.wrap.classList.remove('open-left');
        currentOpenRow = this;
        this._snapTo(-this.rightWidth);
    }

    close() {
        this.state = 'closed';
        this.wrap.classList.remove('open-left', 'open-right');
        if (currentOpenRow === this) {
            currentOpenRow = null;
        }
        this._snapTo(0);
    }

    // === スナップアニメーション ===
    _snapTo(targetX) {
        this.sl.style.transition = `transform ${SWIPE_CONFIG.SNAP_DURATION}ms ${SWIPE_CONFIG.SNAP_EASING}`;
        this.sl.style.transform = `translateX(${targetX}px)`;
        this.currentX = targetX;

        // transitionend後に状態をリセット
        const cleanup = () => {
            this.sl.style.transition = '';
            this.hasMoved = false;
            this.sl.removeEventListener('transitionend', cleanup);
        };
        this.sl.addEventListener('transitionend', cleanup);

        // fallback: transitionendが発火しない場合
        setTimeout(() => {
            this.hasMoved = false;
        }, SWIPE_CONFIG.SNAP_DURATION + 50);
    }

    // === アクション実行 ===
    _executeAction(actionType) {
        const taskData = this.options.taskData;
        if (!taskData) return;

        if (actionType === 'complete') {
            if (this.options.isCompleted) {
                this.options.onAction('uncomplete', taskData.id);
            } else {
                this.options.onAction('complete', taskData.id);
            }
        } else if (actionType === 'delete') {
            this.options.onAction('delete', taskData.id);
        }
    }

    // === クリック抑制 ===
    _onClick(e) {
        // ボタンクリックは常に許可
        if (e.target.closest('button')) {
            return;
        }

        // アクティブなスワイプ中はクリックを抑制
        if (this.hasMoved) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // 開いている状態でカード本体をタップしたら閉じる
        if (this.state !== 'closed') {
            e.preventDefault();
            e.stopPropagation();
            this.close();
        }
    }

    // === 外部から状態を更新 ===
    updateTaskData(taskData, isCompleted) {
        this.options.taskData = taskData;
        this.options.isCompleted = isCompleted;
    }

    // === クリーンアップ ===
    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        if (currentOpenRow === this) {
            currentOpenRow = null;
        }
    }
}

/**
 * 外側タップで開いているカードを閉じる
 */
function initGlobalSwipeHandler() {
    document.addEventListener('pointerdown', (e) => {
        if (!currentOpenRow) return;

        // カード外をタップした場合は閉じる
        if (!e.target.closest('.card')) {
            currentOpenRow.close();
        }
    }, { passive: true });

    // スクロール中は開いているカードを閉じる
    let scrollTimeout = null;
    window.addEventListener('scroll', () => {
        if (currentOpenRow) {
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                if (currentOpenRow) {
                    currentOpenRow.close();
                }
            }, 100);
        }
    }, { passive: true });
}

/**
 * カードにSwipeableRowを適用
 */
function applySwipeToCard(cardElement, taskData, isCompleted, onAction) {
    const swipeRow = new SwipeableRow(cardElement, {
        taskData: taskData,
        isCompleted: isCompleted,
        onAction: onAction,
    });

    // カード要素にインスタンスを保持
    cardElement._swipeRow = swipeRow;

    return swipeRow;
}

/**
 * 全ての開いているカードを閉じる
 */
function closeAllSwipeRows() {
    if (currentOpenRow) {
        currentOpenRow.close();
    }
}

// グローバルハンドラーを初期化
document.addEventListener('DOMContentLoaded', initGlobalSwipeHandler);
