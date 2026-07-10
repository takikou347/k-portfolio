import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fragmentId } from '../../../shared/erase';
import { emptyBoardState } from '../../../shared/ops';
import type { Op, Stroke } from '../../../shared/schema';
import { useStore } from '../../../src/store/store';
import type { BoardConnection } from '../../../src/ws/connection';

const strokeOp: Op = {
  type: 'addStroke',
  stroke: { id: 's1', color: 'white', points: [{ x: 0, y: 0 }] },
};

function fakeConnection() {
  return { send: vi.fn() } as unknown as BoardConnection & { send: ReturnType<typeof vi.fn> };
}

describe('applyLocalOp のガード (無音消失の再発防止)', () => {
  let conn: ReturnType<typeof fakeConnection>;

  beforeEach(() => {
    conn = fakeConnection();
    useStore.setState({
      board: emptyBoardState(),
      myStrokeIds: [],
      full: false,
      status: 'open',
      connection: conn,
    });
  });

  it('接続中 (open) は楽観的に適用され、同じ op が送信される', () => {
    useStore.getState().applyLocalOp(strokeOp);
    expect(useStore.getState().board.strokes).toHaveLength(1);
    expect(useStore.getState().myStrokeIds).toEqual(['s1']);
    expect(conn.send).toHaveBeenCalledWith({ type: 'op', op: strokeOp });
  });

  it('再接続中 (status != open) の op は適用も送信もされない', () => {
    useStore.setState({ status: 'reconnecting' });
    useStore.getState().applyLocalOp(strokeOp);
    expect(useStore.getState().board.strokes).toHaveLength(0);
    expect(conn.send).not.toHaveBeenCalled();
  });

  it('満席 (full) の op は適用も送信もされない', () => {
    useStore.setState({ full: true });
    useStore.getState().applyLocalOp(strokeOp);
    expect(useStore.getState().board.strokes).toHaveLength(0);
    expect(conn.send).not.toHaveBeenCalled();
  });
});

describe('eraseArea と取り消し (myStrokeIds の断片追従)', () => {
  // x = 0..100 を 10 刻みで結ぶ 11 点のストローク。中央 (x=50, r=5) をなぞると
  // 前半 (start=0) と後半 (start=6) の 2 断片に分かれる (tests/shared/erase.test.ts と同一形状)
  const myStroke: Stroke = {
    id: 's1',
    color: 'white',
    points: Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 })),
  };
  const eraseMiddle: Op = { type: 'eraseArea', points: [{ x: 50, y: 0 }], r: 5 };
  const frontId = fragmentId('s1', 0);
  const rearId = fragmentId('s1', 6);
  let conn: ReturnType<typeof fakeConnection>;

  beforeEach(() => {
    conn = fakeConnection();
    useStore.setState({
      board: { strokes: [myStroke], stickies: [] },
      myStrokeIds: ['s1'],
      full: false,
      status: 'open',
      connection: conn,
    });
  });

  it('自分の eraseArea で分割された自分のストロークは、断片が取り消し候補に入れ替わる', () => {
    useStore.getState().applyLocalOp(eraseMiddle);
    expect(useStore.getState().myStrokeIds).toEqual([frontId, rearId]);
    // 登録された断片 id は盤面に実在する (reducer と同じ分割ロジックを使う保証)
    const boardIds = useStore.getState().board.strokes.map((s) => s.id);
    expect(boardIds).toContain(frontId);
    expect(boardIds).toContain(rearId);
    expect(boardIds).not.toContain('s1');
  });

  it('他人の eraseArea (サーバー経由) で分割されても断片が取り消し候補に入る', () => {
    useStore.getState().handleServerMessage({ type: 'op', op: eraseMiddle });
    expect(useStore.getState().myStrokeIds).toEqual([frontId, rearId]);
  });

  it('分割後の断片を undoLast で取り消せる', () => {
    useStore.getState().applyLocalOp(eraseMiddle);
    conn.send.mockClear();
    useStore.getState().undoLast();
    expect(conn.send).toHaveBeenCalledWith({
      type: 'op',
      op: { type: 'eraseStroke', strokeId: rearId },
    });
    expect(useStore.getState().board.strokes.map((s) => s.id)).not.toContain(rearId);
  });

  it('全消しされたストロークと盤面に存在しない id は myStrokeIds から掃除される', () => {
    useStore.setState({ myStrokeIds: ['ghost', 's1'] });
    // r=100 で全点が半径内 → s1 は全消し。'ghost' は盤面に無いので同時に除去される
    useStore.getState().applyLocalOp({ type: 'eraseArea', points: [{ x: 50, y: 0 }], r: 100 });
    expect(useStore.getState().myStrokeIds).toEqual([]);
    expect(useStore.getState().board.strokes).toHaveLength(0);
  });

  it('消しゴムに触れていないストロークの id はそのまま残る', () => {
    const far: Stroke = { id: 'far', color: 'blue', points: [{ x: 0, y: 500 }] };
    useStore.setState((s) => ({
      board: { ...s.board, strokes: [...s.board.strokes, far] },
      myStrokeIds: ['s1', 'far'],
    }));
    useStore.getState().applyLocalOp(eraseMiddle);
    expect(useStore.getState().myStrokeIds).toEqual([frontId, rearId, 'far']);
  });
});
