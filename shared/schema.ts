import { z } from 'zod';
import {
  ERASE_RADIUS_MAX,
  ERASE_RADIUS_MIN,
  MAX_ERASE_POINTS,
  MAX_STROKE_POINTS,
  NAME_MAX,
  NAME_MIN,
  STICKY_FONT_DEFAULT,
  STICKY_FONT_MAX,
  STICKY_FONT_MIN,
  STICKY_H_DEFAULT,
  STICKY_H_MAX,
  STICKY_H_MIN,
  STICKY_TEXT_MAX,
  STICKY_W_DEFAULT,
  STICKY_W_MAX,
  STICKY_W_MIN,
} from './limits';

/** ボード座標。異常値 (Infinity / 桁あふれ) は受け付けない */
const COORD_LIMIT = 1_000_000;
export const coordSchema = z.number().finite().min(-COORD_LIMIT).max(COORD_LIMIT);

/** カーソル (マグネット) の色 */
export const userColorSchema = z.enum(['red', 'blue', 'yellow', 'pink']);
export type UserColor = z.infer<typeof userColorSchema>;

export const nameSchema = z.string().min(NAME_MIN).max(NAME_MAX);

/** 入室情報 (WS 接続時のクエリで渡す) */
export const joinSchema = z.object({
  name: nameSchema,
  color: userColorSchema,
});
export type Join = z.infer<typeof joinSchema>;

export const userSchema = z.object({
  id: z.string().min(1).max(64),
  name: nameSchema,
  color: userColorSchema,
});
export type User = z.infer<typeof userSchema>;

// ---- 盤面の要素 ----

export const pointSchema = z.object({ x: coordSchema, y: coordSchema });
export type Point = z.infer<typeof pointSchema>;

/** チョークの色 (描画色) */
export const chalkColorSchema = z.enum(['white', 'pink', 'yellow', 'blue']);
export type ChalkColor = z.infer<typeof chalkColorSchema>;

const idSchema = z.string().min(1).max(64);

export const strokeSchema = z.object({
  id: idSchema,
  color: chalkColorSchema,
  points: z.array(pointSchema).min(1).max(MAX_STROKE_POINTS),
});
export type Stroke = z.infer<typeof strokeSchema>;

/** 付箋の色 (素材の見た目は画用紙。UI 上の呼称は「付箋」に統一) */
export const paperColorSchema = z.enum(['cream', 'rose', 'sky']);
export type PaperColor = z.infer<typeof paperColorSchema>;

export const stickyTextSchema = z.string().max(STICKY_TEXT_MAX);

/** 付箋のサイズ・文字サイズ (px)。整数・範囲内のみ受け付ける */
export const stickyWSchema = z.number().int().min(STICKY_W_MIN).max(STICKY_W_MAX);
export const stickyHSchema = z.number().int().min(STICKY_H_MIN).max(STICKY_H_MAX);
export const stickyFontSchema = z.number().int().min(STICKY_FONT_MIN).max(STICKY_FONT_MAX);

export const stickySchema = z.object({
  id: idSchema,
  x: coordSchema,
  y: coordSchema,
  color: paperColorSchema,
  text: stickyTextSchema,
  // 任意フィールド。未指定の (旧) 付箋にはデフォルト値を補完する = 後方互換
  w: stickyWSchema.default(STICKY_W_DEFAULT),
  h: stickyHSchema.default(STICKY_H_DEFAULT),
  fontSize: stickyFontSchema.default(STICKY_FONT_DEFAULT),
});
export type Sticky = z.infer<typeof stickySchema>;

// ---- op (盤面への変更。クライアント/DO 共用の reducer で適用する) ----

export const opSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('addStroke'), stroke: strokeSchema }),
  z.object({ type: z.literal('eraseStroke'), strokeId: idSchema }),
  // 部分消し: 消しゴムの軌跡 (カプセル列) に触れた部分だけを消す
  z.object({
    type: z.literal('eraseArea'),
    points: z.array(pointSchema).min(1).max(MAX_ERASE_POINTS),
    r: z.number().finite().min(ERASE_RADIUS_MIN).max(ERASE_RADIUS_MAX),
  }),
  // 全消し: 盤面のチョークストロークをすべて消す (付箋は対象外)
  z.object({ type: z.literal('clearStrokes') }),
  // 左から拭き取り: x (ボード座標) より左のチョークを消す。スライダー全消しが使う
  z.object({ type: z.literal('wipeLeftOf'), x: coordSchema }),
  z.object({ type: z.literal('addSticky'), sticky: stickySchema }),
  z.object({ type: z.literal('moveSticky'), id: idSchema, x: coordSchema, y: coordSchema }),
  z.object({ type: z.literal('editSticky'), id: idSchema, text: stickyTextSchema }),
  z.object({ type: z.literal('recolorSticky'), id: idSchema, color: paperColorSchema }),
  z.object({
    type: z.literal('resizeSticky'),
    id: idSchema,
    w: stickyWSchema,
    h: stickyHSchema,
    fontSize: stickyFontSchema,
  }),
  z.object({ type: z.literal('deleteSticky'), id: idSchema }),
]);
export type Op = z.infer<typeof opSchema>;

// ---- クライアント → サーバー ----

export const cursorMessageSchema = z.object({
  type: z.literal('cursor'),
  x: coordSchema,
  y: coordSchema,
});

/** リアクションの絵文字 (4 種) */
export const REACTION_EMOJIS = ['👏', '✨', '💮', '❤️'] as const;
export const reactionEmojiSchema = z.enum(REACTION_EMOJIS);
export type ReactionEmoji = z.infer<typeof reactionEmojiSchema>;

export const reactionMessageSchema = z.object({
  type: z.literal('reaction'),
  emoji: reactionEmojiSchema,
  x: coordSchema,
  y: coordSchema,
});

/** 描画中のストロークの増分プレビュー (ephemeral、16ms バッチ) */
export const strokingMessageSchema = z.object({
  type: z.literal('stroking'),
  strokeId: idSchema,
  color: chalkColorSchema,
  points: z.array(pointSchema).min(1).max(MAX_STROKE_POINTS),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  cursorMessageSchema,
  reactionMessageSchema,
  strokingMessageSchema,
  z.object({ type: z.literal('op'), op: opSchema }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ---- サーバー → クライアント ----

export const boardStateSchema = z.object({
  strokes: z.array(strokeSchema),
  stickies: z.array(stickySchema),
});

export const snapshotMessageSchema = z.object({
  type: z.literal('snapshot'),
  self: userSchema,
  users: z.array(userSchema),
  /** 満席 (読み取り専用) で入室したか */
  full: z.boolean(),
  state: boardStateSchema,
});

export const presenceMessageSchema = z.object({
  type: z.literal('presence'),
  event: z.enum(['join', 'leave']),
  user: userSchema,
  users: z.array(userSchema),
});

export const serverCursorMessageSchema = z.object({
  type: z.literal('cursor'),
  userId: z.string().min(1).max(64),
  x: coordSchema,
  y: coordSchema,
});

export const serverStrokingMessageSchema = strokingMessageSchema.extend({
  userId: idSchema,
});

export const serverReactionMessageSchema = reactionMessageSchema.extend({
  userId: idSchema,
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  snapshotMessageSchema,
  presenceMessageSchema,
  serverCursorMessageSchema,
  serverStrokingMessageSchema,
  serverReactionMessageSchema,
  z.object({ type: z.literal('op'), op: opSchema }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
