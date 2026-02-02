/* =============================================
   ムキムキタスくん - 設定・定数
   ============================================= */

// === 環境判定 ===
const ENV = (() => {
    const h = window.location.hostname;
    if (h.includes('ngrok-free.dev') || h === 'localhost' || h === '127.0.0.1') return 'DEV';
    return 'PROD';
})();

// === LIFF・API設定 ===
const LIFF_ID = ENV === 'DEV'
    ? "2008372898-LoDbZEAC"   // 開発用LIFF
    : "2008372898-2q9qWmxv";  // 本番用LIFF
const API_BASE = "https://lumicreate.xvps.jp/webhook"; // DEV/PROD共通（本番DB）

// === 開発者制限（DEVのみ）===
const DEV_ALLOWED_USER_ID = "Ue5456da08f02d887957a994c3de73d7b"; // ← 初回DEV起動後に自分のuserIdに差し替え

// === スワイプ設定（調整可能パラメータ）===
const SWIPE_CONFIG = {
    // 横ロック判定
    LOCK_THRESHOLD: 10,           // 横ロック判定を開始する最小移動量(px)
    LOCK_ANGLE_RATIO: 1.2,        // |dx| > |dy| * この値 で横ロック確定

    // スナップ判定
    SNAP_THRESHOLD_RATIO: 0.4,    // ボタン幅の何%でスナップ判定（距離）
    VELOCITY_THRESHOLD: 0.5,      // フリック判定の速度閾値(px/ms)
    FULL_SWIPE_RATIO: 0.45,       // フルスワイプ発動：画面幅の何%で発動

    // ラバーバンド効果
    RUBBER_BAND_FACTOR: 0.35,     // 上限超過時の減衰率（0.35 = 35%に圧縮）

    // アニメーション
    SNAP_DURATION: 200,           // スナップアニメーション時間(ms)
    SNAP_EASING: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', // ease-out相当

    // タップ判定
    TAP_SLOP: 8,                  // これ以下の移動はタップとみなす(px)

    // 速度計算
    VELOCITY_SAMPLE_COUNT: 3,     // 速度計算に使うサンプル数
};

// === タスク関連定数 ===
const STRONG_RATIO = SWIPE_CONFIG.FULL_SWIPE_RATIO;
const SNAP_THRESHOLD = 40; // 後方互換用

// === 習慣リスト ===
const HABITS = [
    { id: 'early_wake', name: '早起き', icon: '🌅' },
    { id: 'mission', name: 'ミッション', icon: '🎯' },
    { id: 'reading', name: '読書/学習', icon: '📚' },
    { id: 'journal', name: 'ジャーナル', icon: '📝' },
    { id: 'no_alcohol', name: '禁酒', icon: '🚫' },
    { id: 'workout', name: '今日トレ', icon: '💪' }
];

// === MBTI関連 ===
const MBTI_NAMES = {
    'INTJ': '建築家', 'INTP': '論理学者', 'ENTJ': '指揮官', 'ENTP': '討論者',
    'INFJ': '提唱者', 'INFP': '仲介者', 'ENFJ': '主人公', 'ENFP': '広報運動家',
    'ISTJ': '管理者', 'ISFJ': '擁護者', 'ESTJ': '幹部', 'ESFJ': '領事官',
    'ISTP': '巨匠', 'ISFP': '冒険家', 'ESTP': '起業家', 'ESFP': 'エンターテイナー'
};

// === レベル称号 ===
const LEVEL_TITLES = [
    { min: 1, max: 5, title: '見習いトレーニー' },
    { min: 6, max: 10, title: 'ルーキーファイター' },
    { min: 11, max: 20, title: 'レギュラーウォリアー' },
    { min: 21, max: 35, title: 'シルバーチャンピオン' },
    { min: 36, max: 50, title: 'ゴールドマスター' },
    { min: 51, max: 75, title: 'プラチナエリート' },
    { min: 76, max: 100, title: 'ダイヤモンドレジェンド' },
    { min: 101, max: 999, title: 'ムキムキ神' }
];
