// 無料枠保護・プロトコル上限の単一情報源。クライアント / DO の両方がここを参照する。

/** 1 ボードの同時接続数上限。超過したクライアントは読み取り専用 (満席) になる */
export const MAX_CONNECTIONS = 100;

/** 満席後に読み取り専用で見学できる接続数の上限。これも超えたら接続自体を拒否する */
export const MAX_SPECTATORS = 20;

/** スペクテータ上限超過による接続拒否の WebSocket close code (再接続を止める合図) */
export const CLOSE_CODE_FULL = 4003;

/** 接続ごとの op 受信レート上限 (件/秒)。超過分は黙って破棄 */
export const OPS_PER_SECOND = 20;

/** 接続ごとの cursor 受信レート上限 (件/秒)。超過分は黙って破棄 */
export const CURSORS_PER_SECOND = 15;

/** 接続ごとの reaction 受信レート上限 (件/秒)。超過分は黙って破棄 */
export const REACTIONS_PER_SECOND = 3;

/**
 * 接続ごとの stroking (描画中プレビュー) 受信レート上限 (件/秒)。
 * 16ms バッチ ≈ 60件/秒 を許容しつつ暴走を破棄する
 */
export const STROKINGS_PER_SECOND = 70;

/** 1 ボードのストローク上限。超過時は古い順に間引く */
export const MAX_STROKES = 2000;

/** 1 ストロークの最大点数 (スキーマで拒否する) */
export const MAX_STROKE_POINTS = 600;

/** 1 ボードの付箋上限。超過分の addSticky は無視する */
export const MAX_STICKIES = 200;

/** 付箋テキストの最大文字数 */
export const STICKY_TEXT_MAX = 80;

/**
 * 付箋のサイズ・文字サイズ (px)。無料枠ではなくレイアウト保護のための範囲。
 * w/h/fontSize はスキーマの任意フィールドで、未指定の (旧) 付箋にはデフォルト値が補完される。
 */
export const STICKY_W_DEFAULT = 180;
export const STICKY_W_MIN = 120;
export const STICKY_W_MAX = 360;
export const STICKY_H_DEFAULT = 140;
export const STICKY_H_MIN = 100;
export const STICKY_H_MAX = 360;
export const STICKY_FONT_DEFAULT = 15;
export const STICKY_FONT_MIN = 12;
export const STICKY_FONT_MAX = 28;
/** サイズ・文字サイズの 1 ステップ (UI の −/＋ が動かす量) */
export const STICKY_SIZE_STEP = 30;
export const STICKY_FONT_STEP = 2;

/** 入室名の文字数 */
export const NAME_MIN = 2;
export const NAME_MAX = 8;

/** カーソル座標の送信スロットル (ms) */
export const CURSOR_THROTTLE_MS = 80;

/** ストローク中の点のバッチ送信間隔 (ms) */
export const STROKE_BATCH_MS = 16;

/** ズーム倍率の範囲 */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
