import { eraseStrokePath } from './erase';
import { MAX_STICKIES, MAX_STROKES } from './limits';
import type { Op, Sticky, Stroke } from './schema';

/** 盤面の状態。クライアントの store と DO のキャッシュの両方がこの形を使う */
export type BoardState = {
  strokes: Stroke[];
  stickies: Sticky[];
};

export function emptyBoardState(): BoardState {
  return { strokes: [], stickies: [] };
}

function updateSticky(
  state: BoardState,
  id: string,
  patch: (sticky: Sticky) => Sticky,
): BoardState {
  const index = state.stickies.findIndex((s) => s.id === id);
  if (index < 0) return state;
  const stickies = [...state.stickies];
  stickies[index] = patch(stickies[index]);
  return { ...state, stickies };
}

/**
 * 盤面への変更を適用する純粋な reducer。クライアント (楽観的適用) と DO (正) が共用する。
 * 無効な op (存在しない id など) は無視し、変更がなければ同一参照の state を返す。
 */
export function applyOp(state: BoardState, op: Op): BoardState {
  switch (op.type) {
    case 'addStroke': {
      if (state.strokes.some((s) => s.id === op.stroke.id)) return state;
      const strokes = [...state.strokes, op.stroke];
      // 上限を超えたら古い順に間引く
      const trimmed =
        strokes.length > MAX_STROKES ? strokes.slice(strokes.length - MAX_STROKES) : strokes;
      return { ...state, strokes: trimmed };
    }
    case 'eraseStroke': {
      const strokes = state.strokes.filter((s) => s.id !== op.strokeId);
      if (strokes.length === state.strokes.length) return state;
      return { ...state, strokes };
    }
    case 'eraseArea': {
      // 部分消し: 軌跡に触れた部分を取り除き、残った区間を断片に分割する。
      // 断片は必ず末尾に追加する — DO の SQLite は断片を追記 (新しい seq) でしか
      // 永続化できないため、配列の並びを追記順に揃えてハイバネーション復帰後も
      // 順序 (描画の重なり・上限トリムの対象) がズレないようにする
      const kept: Stroke[] = [];
      const added: Stroke[] = [];
      for (const s of state.strokes) {
        const fragments = eraseStrokePath(s, op.points, op.r);
        if (fragments === null) kept.push(s);
        else added.push(...fragments);
      }
      if (kept.length === state.strokes.length) return state;
      const strokes = [...kept, ...added];
      const trimmed =
        strokes.length > MAX_STROKES ? strokes.slice(strokes.length - MAX_STROKES) : strokes;
      return { ...state, strokes: trimmed };
    }
    case 'clearStrokes': {
      if (state.strokes.length === 0) return state;
      return { ...state, strokes: [] };
    }
    case 'addSticky': {
      if (state.stickies.some((s) => s.id === op.sticky.id)) return state;
      if (state.stickies.length >= MAX_STICKIES) return state;
      return { ...state, stickies: [...state.stickies, op.sticky] };
    }
    case 'moveSticky':
      return updateSticky(state, op.id, (s) => ({ ...s, x: op.x, y: op.y }));
    case 'editSticky':
      return updateSticky(state, op.id, (s) => ({ ...s, text: op.text }));
    case 'recolorSticky':
      return updateSticky(state, op.id, (s) => ({ ...s, color: op.color }));
    case 'resizeSticky':
      return updateSticky(state, op.id, (s) => ({
        ...s,
        w: op.w,
        h: op.h,
        fontSize: op.fontSize,
      }));
    case 'deleteSticky': {
      const stickies = state.stickies.filter((s) => s.id !== op.id);
      if (stickies.length === state.stickies.length) return state;
      return { ...state, stickies };
    }
  }
}
