import { create } from 'zustand';
import { eraseStrokePath, wipeStrokeLeftOf } from '../../shared/erase';
import { MAX_STROKE_POINTS, MAX_STROKES, REACTIONS_PER_SECOND } from '../../shared/limits';
import { applyOp, emptyBoardState, type BoardState } from '../../shared/ops';
import type {
  ChalkColor,
  Op,
  ReactionEmoji,
  ServerMessage,
  Stroke,
  User,
} from '../../shared/schema';
import { zoomAt, type Point, type View } from '../board/view';
import type { BoardConnection, ConnectionStatus } from '../ws/connection';

export type Tool = 'chalk' | 'eraser' | 'sticky';
export type { ChalkColor };

/** 他人が描いている途中のストローク (ephemeral プレビュー) */
export type StrokeDraft = {
  userId: string;
  color: ChalkColor;
  points: Point[];
  /** 最終更新時刻。途切れた draft の掃除に使う */
  at: number;
};

/** 更新が途絶えた draft を破棄するまでの時間 (ms) */
const DRAFT_TTL_MS = 6000;

/**
 * eraseArea / wipeLeftOf で自分のストロークが分割・消滅したとき、myStrokeIds を
 * 断片 id に追従させる。分割判定は reducer と同じ shared のロジックを使う
 * (二重実装しない) ため、断片 id は盤面に実際に追加されるものと必ず一致する。
 * ついでに盤面に存在しない id もここで掃除する (溜まり続けの防止)。
 *
 * @param strokes 適用「前」の盤面ストローク (適用後では消えた親を引けない)
 * @param split reducer と同じ分割関数 (触れていなければ null を返す)
 */
function remapMyStrokeIds(
  myStrokeIds: string[],
  strokes: Stroke[],
  split: (stroke: Stroke) => Stroke[] | null,
): string[] {
  const next: string[] = [];
  for (const id of myStrokeIds) {
    const stroke = strokes.find((s) => s.id === id);
    if (!stroke) continue; // 盤面にもう無い id は取り消し候補から外す
    const fragments = split(stroke);
    if (fragments === null) {
      next.push(id); // 消しゴムに触れていない
    } else {
      // 親は盤面から消える。残った断片 (全消しなら 0 本) を代わりに取り消し候補へ
      for (const fragment of fragments) next.push(fragment.id);
    }
  }
  return next.slice(-MAX_STROKES);
}

/** op に対応するストローク分割関数を返す (分割系の op でなければ null) */
function splitterFor(op: Op): ((stroke: Stroke) => Stroke[] | null) | null {
  if (op.type === 'eraseArea') return (s) => eraseStrokePath(s, op.points, op.r);
  if (op.type === 'wipeLeftOf') return (s) => wipeStrokeLeftOf(s, op.x);
  return null;
}

type Store = {
  view: View;
  /** 2本指パン/ピンチ中は描画系の操作を止める */
  gestureActive: boolean;
  /** Space キー押下中 (パンモード)。描画を止める */
  spacePan: boolean;
  tool: Tool;
  chalkColor: ChalkColor;
  setTool: (tool: Tool) => void;
  setChalkColor: (color: ChalkColor) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAtPoint: (center: Point, factor: number) => void;
  setScale: (scale: number, center: Point) => void;
  setGestureActive: (active: boolean) => void;
  setSpacePan: (active: boolean) => void;

  // ---- リアルタイム ----
  connection: BoardConnection | null;
  status: ConnectionStatus;
  self: User | null;
  users: User[];
  full: boolean;
  /** この黒板が削除された (再接続せず、操作も受け付けない) */
  deleted: boolean;
  /** 他人のカーソル位置 (ボード座標)。userId → 座標 */
  cursors: Record<string, Point>;
  setConnection: (connection: BoardConnection | null) => void;
  setStatus: (status: ConnectionStatus) => void;
  /** スペクテータ上限超過で接続拒否された (読み取りもできない満席) */
  markFull: () => void;
  markDeleted: () => void;
  handleServerMessage: (msg: ServerMessage) => void;

  // ---- 盤面 ----
  board: BoardState;
  /** 他人の描画中プレビュー。strokeId → draft */
  drafts: Record<string, StrokeDraft>;
  /** 自分が描いたストローク id (取り消し用) */
  myStrokeIds: string[];
  /** 楽観的に即時適用し、同じ op をサーバーへ送る */
  applyLocalOp: (op: Op) => void;
  /** 自分の直近のストロークに eraseStroke を送る (専用 op は作らない) */
  undoLast: () => void;
  pruneDrafts: (now: number) => void;

  // ---- リアクション ----
  /** 表示中のリアクション演出 (ephemeral) */
  reactions: { key: string; emoji: ReactionEmoji; x: number; y: number }[];
  /** 自分のリアクション送信時刻 (直近 1 秒分)。レート制限用 */
  reactionTimes: number[];
  /** リアクションを表示し、1.4 秒後に自動で消す */
  showReaction: (emoji: ReactionEmoji, x: number, y: number) => void;
  /** 自分のリアクションを送る (秒 3 回までのクライアント側ガード付き) */
  sendReaction: (emoji: ReactionEmoji, pos: Point) => void;

  // ---- 付箋 UI ----
  /** SP のボトムシートで開いている付箋 id (transform 層の外に描画するため store に置く) */
  sheetStickyId: string | null;
  setSheetSticky: (id: string | null) => void;
  /** 作成直後にその場で編集を開くためのリクエスト */
  editRequestId: string | null;
  requestStickyEdit: (id: string | null) => void;
};

export const useStore = create<Store>()((set, get) => ({
  view: { x: 0, y: 0, scale: 1 },
  gestureActive: false,
  spacePan: false,
  tool: 'chalk',
  chalkColor: 'white',
  setTool: (tool) => set({ tool }),
  setChalkColor: (chalkColor) => set({ chalkColor, tool: 'chalk' }),
  panBy: (dx, dy) => set((s) => ({ view: { ...s.view, x: s.view.x + dx, y: s.view.y + dy } })),
  zoomAtPoint: (center, factor) =>
    set((s) => ({ view: zoomAt(s.view, center, s.view.scale * factor) })),
  setScale: (scale, center) => set((s) => ({ view: zoomAt(s.view, center, scale) })),
  setGestureActive: (gestureActive) => set({ gestureActive }),
  setSpacePan: (spacePan) => set({ spacePan }),

  connection: null,
  status: 'connecting',
  self: null,
  users: [],
  full: false,
  deleted: false,
  cursors: {},
  setConnection: (connection) => set({ connection }),
  setStatus: (status) => set({ status }),
  markFull: () => set({ full: true }),
  markDeleted: () => set({ deleted: true, cursors: {}, drafts: {} }),
  handleServerMessage: (msg) => {
    switch (msg.type) {
      case 'snapshot':
        // 再接続時もスナップショットで盤面を取り直す
        set({
          self: msg.self,
          users: msg.users,
          full: msg.full,
          cursors: {},
          board: msg.state,
          drafts: {},
        });
        break;
      case 'presence':
        set((s) => {
          const users = msg.users;
          if (msg.event === 'leave') {
            const cursors = { ...s.cursors };
            delete cursors[msg.user.id];
            // 描きかけのまま切断した人の draft も掃除する
            const drafts = Object.fromEntries(
              Object.entries(s.drafts).filter(([, d]) => d.userId !== msg.user.id),
            );
            return { users, cursors, drafts };
          }
          return { users };
        });
        break;
      case 'cursor':
        set((s) => {
          if (msg.userId === s.self?.id) return s; // 自分のエコーは無視
          return { cursors: { ...s.cursors, [msg.userId]: { x: msg.x, y: msg.y } } };
        });
        break;
      case 'reaction':
        get().showReaction(msg.emoji, msg.x, msg.y);
        break;
      case 'stroking':
        set((s) => {
          const prev = s.drafts[msg.strokeId];
          const points = [...(prev?.points ?? []), ...msg.points].slice(0, MAX_STROKE_POINTS);
          return {
            drafts: {
              ...s.drafts,
              [msg.strokeId]: { userId: msg.userId, color: msg.color, points, at: Date.now() },
            },
          };
        });
        break;
      case 'op':
        set((s) => {
          const board = applyOp(s.board, msg.op);
          let drafts = s.drafts;
          let myStrokeIds = s.myStrokeIds;
          if (msg.op.type === 'addStroke' && s.drafts[msg.op.stroke.id]) {
            drafts = { ...s.drafts };
            delete drafts[msg.op.stroke.id];
          }
          if (msg.op.type === 'eraseStroke') {
            // 他人に消された自分のストロークは取り消し候補から外す
            const strokeId = msg.op.strokeId;
            myStrokeIds = myStrokeIds.filter((id) => id !== strokeId);
          } else if (msg.op.type === 'clearStrokes') {
            myStrokeIds = [];
          } else {
            const split = splitterFor(msg.op);
            if (split) {
              // 他人の部分消し・拭き取りで自分のストロークが分割されても断片を取り消せるようにする
              myStrokeIds = remapMyStrokeIds(s.myStrokeIds, s.board.strokes, split);
            }
          }
          return { board, drafts, myStrokeIds };
        });
        break;
    }
  },

  board: emptyBoardState(),
  drafts: {},
  myStrokeIds: [],
  applyLocalOp: (op) => {
    // 読み取り専用 (満席)・削除済み・再接続中は受け付けない。
    // 接続断中に楽観適用すると、送信されないまま snapshot で無音ロールバックされるため
    if (get().full || get().deleted || get().status !== 'open') return;
    set((s) => {
      const board = applyOp(s.board, op);
      let myStrokeIds = s.myStrokeIds;
      if (op.type === 'addStroke') {
        // 盤面に残れる本数以上は覚えても意味がないので単調増加を防ぐ
        myStrokeIds = [...myStrokeIds, op.stroke.id].slice(-MAX_STROKES);
      } else if (op.type === 'eraseStroke') {
        const strokeId = op.strokeId;
        myStrokeIds = myStrokeIds.filter((id) => id !== strokeId);
      } else if (op.type === 'clearStrokes') {
        myStrokeIds = [];
      } else {
        const split = splitterFor(op);
        if (split) {
          // 自分の部分消し・拭き取りに自分のストロークが巻き込まれても断片を取り消せるようにする
          myStrokeIds = remapMyStrokeIds(s.myStrokeIds, s.board.strokes, split);
        }
      }
      return { board, myStrokeIds };
    });
    get().connection?.send({ type: 'op', op });
  },
  undoLast: () => {
    const { myStrokeIds, board, applyLocalOp } = get();
    const target = [...myStrokeIds].reverse().find((id) => board.strokes.some((s) => s.id === id));
    if (target) applyLocalOp({ type: 'eraseStroke', strokeId: target });
  },
  pruneDrafts: (now) => {
    const { drafts } = get();
    const alive = Object.entries(drafts).filter(([, d]) => now - d.at < DRAFT_TTL_MS);
    if (alive.length !== Object.keys(drafts).length) {
      set({ drafts: Object.fromEntries(alive) });
    }
  },

  reactions: [],
  reactionTimes: [],
  showReaction: (emoji, x, y) => {
    const key = crypto.randomUUID();
    set((s) => ({ reactions: [...s.reactions, { key, emoji, x, y }] }));
    setTimeout(() => {
      set((s) => ({ reactions: s.reactions.filter((r) => r.key !== key) }));
    }, 1400);
  },
  sendReaction: (emoji, pos) => {
    // 連打可、ただし秒 3 回まで (超過分はサーバーでも破棄される)
    const now = Date.now();
    const times = get().reactionTimes.filter((t) => now - t < 1000);
    if (times.length >= REACTIONS_PER_SECOND) {
      set({ reactionTimes: times });
      return;
    }
    set({ reactionTimes: [...times, now] });
    get().connection?.send({ type: 'reaction', emoji, x: pos.x, y: pos.y });
    get().showReaction(emoji, pos.x, pos.y);
  },

  sheetStickyId: null,
  setSheetSticky: (sheetStickyId) => set({ sheetStickyId }),
  editRequestId: null,
  requestStickyEdit: (editRequestId) => set({ editRequestId }),
}));
