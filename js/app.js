/* =============================================
   ムキムキタスくん - アプリケーション初期化
   ============================================= */

let userId = null;
let currentEntitlements = null;
let planData = null;

/**
 * アプリ初期化
 */
async function init() {
    // checkout成功フラグ
    const urlParams = new URLSearchParams(window.location.search);
    const isCheckoutSuccess = urlParams.get('checkout') === 'success';

    if (isCheckoutSuccess) {
        window.history.replaceState({}, '', window.location.pathname);
    }

    // LIFF初期化
    console.log(`[ムキムキタスくん] ENV=${ENV}, LIFF_ID=${LIFF_ID}`);
    try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
            const loginKey = 'liff_login_attempt';
            const attempts = parseInt(sessionStorage.getItem(loginKey) || '0');
            if (attempts >= 2) {
                // 3回目以降 → ループ防止、案内表示
                sessionStorage.removeItem(loginKey);
                console.warn('[LIFF] ログイン失敗（試行回数超過）');
                const liffUrl = `https://liff.line.me/${LIFF_ID}`;
                document.body.innerHTML = `
                    <div style="text-align:center;padding:60px 20px;font-family:sans-serif;">
                        <div style="font-size:48px;margin-bottom:16px;">💪</div>
                        <div style="font-size:18px;font-weight:700;color:#0d1b2a;margin-bottom:12px;">ムキムキタスくん</div>
                        <div style="font-size:14px;color:#778da9;margin-bottom:24px;line-height:1.6;">
                            LINEログインが完了できませんでした。<br>
                            LINEアプリから以下のリンクを開いてください。
                        </div>
                        <a href="${liffUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#ff9f43,#ff6b6b);color:white;border-radius:25px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 15px rgba(255,107,107,0.3);">
                            LINEで開く
                        </a>
                        <div style="margin-top:24px;font-size:11px;color:#aaa;">ENV: ${ENV} / LIFF: ${LIFF_ID}</div>
                    </div>`;
                return;
            }
            sessionStorage.setItem(loginKey, String(attempts + 1));

            if (liff.isInClient()) {
                // LINEアプリ内ブラウザ → liff.line.me 経由
                console.log('[LIFF] LINEアプリ内 → liff.line.me へリダイレクト');
                window.location.href = `https://liff.line.me/${LIFF_ID}`;
            } else {
                // 外部ブラウザ（PC等）→ liff.login() でOAuth認証
                console.log('[LIFF] 外部ブラウザ → liff.login() でOAuth開始');
                liff.login({ redirectUri: window.location.origin + window.location.pathname });
            }
            return;
        }

        // ログイン成功 → カウンターをクリア
        sessionStorage.removeItem('liff_login_attempt');
        const profile = await liff.getProfile();
        userId = profile.userId;

        // DEV環境：開発者以外はブロック
        if (ENV === 'DEV' && DEV_ALLOWED_USER_ID !== '<DEV_ALLOWED_USER_ID>' && userId !== DEV_ALLOWED_USER_ID) {
            document.body.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#778da9;font-size:16px;">開発環境のため、アクセスが制限されています。</div>';
            return;
        }
        if (ENV === 'DEV') {
            console.log('[DEV] userId:', userId);
        }
    } catch (e) {
        console.error("LIFF初期化エラー:", e);
        userId = "demo_user";
    }

    // デモモードではデータ読み込みをスキップ
    if (userId === 'demo_user') {
        bindUI();
        return;
    }

    // entitlements、プラン一覧、app_configを取得
    await Promise.all([loadEntitlements(), loadPlans(), loadAppConfig()]);

    // checkout成功時のリトライ処理
    if (isCheckoutSuccess) {
        await handleCheckoutSuccess();
    }

    bindUI();
    updateTabLockUI();
    initDeveloperMenu();
    await loadAllData();
}

/**
 * UI初期化
 */
function bindUI() {
    // タブナビゲーション
    document.querySelectorAll('.tab-nav-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    // リストタブ
    document.getElementById('refreshBtn').onclick = loadList;
    document.getElementById('btnAdd').onclick = addTask;
    document.getElementById('newTitle').addEventListener('keypress', e => {
        if (e.key === 'Enter') addTask();
    });

    // ステータスタブ
    document.getElementById('statusRefreshBtn').onclick = loadHabits;
    document.getElementById('dailyTaskCard').addEventListener('click', e => {
        if (!e.target.closest('.habit-checkbox') && !e.target.closest('.daily-btn')) {
            document.getElementById('dailyTaskCard').classList.toggle('expanded');
        }
    });
    document.getElementById('habitSaveBtn').onclick = saveHabits;
    document.getElementById('habitCancelBtn').onclick = () => {
        document.getElementById('dailyTaskCard').classList.remove('expanded');
    };
    renderHabitList();

    // ジャーナルタブ
    document.getElementById('journalRefreshBtn').onclick = loadJournals;
    document.getElementById('journalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('journalSubmitBtn').onclick = saveJournal;

    // 各種モーダルUI初期化
    bindModalUI();
    bindTaskDetailModalUI();
    bindMonthlyAnalysisUI();
    bindJournalDetailModalUI();
    bindPriorityModalUI();
    bindMscUI();
    bindMbtiModalUI();
    bindMissionModalUI();
    bindUpgradeModalUI();
}

/**
 * タブ切り替え
 */
function switchTab(tabId) {
    // gating_enabled が true の場合のみ権限チェック
    const gatingOn = typeof isGatingEnabled === 'function' && isGatingEnabled();

    if (gatingOn && tabId === 'status' && currentEntitlements && !currentEntitlements.can_status) {
        showUpgradeModal('ステータス機能');
        return;
    }
    if (gatingOn && tabId === 'journal' && currentEntitlements && !currentEntitlements.can_journal) {
        showUpgradeModal('ジャーナル機能');
        return;
    }

    document.querySelectorAll('.tab-nav-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab-nav-item[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');

    // スワイプを閉じる
    closeAllSwipeRows();
}

/**
 * タブのロック表示更新
 */
function updateTabLockUI() {
    const statusTab = document.querySelector('.tab-nav-item[data-tab="status"]');
    const journalTab = document.querySelector('.tab-nav-item[data-tab="journal"]');
    const gatingOn = typeof isGatingEnabled === 'function' && isGatingEnabled();

    if (gatingOn && currentEntitlements && !currentEntitlements.can_status) {
        statusTab.innerHTML = 'ステータス<span class="lock-icon">🔒</span>';
        statusTab.classList.add('locked');
    } else {
        statusTab.innerHTML = 'ステータス';
        statusTab.classList.remove('locked');
    }

    if (gatingOn && currentEntitlements && !currentEntitlements.can_journal) {
        journalTab.innerHTML = 'ジャーナル<span class="lock-icon">🔒</span>';
        journalTab.classList.add('locked');
    } else {
        journalTab.innerHTML = 'ジャーナル';
        journalTab.classList.remove('locked');
    }
}

/**
 * 全データ読み込み
 */
async function loadAllData() {
    const promises = [loadList(), loadMissionTask()];

    if (currentEntitlements?.can_status) {
        promises.push(loadHabits(), loadMscData());
    }

    if (currentEntitlements?.can_journal) {
        promises.push(loadJournals());
    }

    await Promise.all(promises);
}

// アプリ起動
init();
