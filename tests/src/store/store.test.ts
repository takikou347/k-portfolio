import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBoardState } from '../../../shared/ops';
import type { Op } from '../../../shared/schema';
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
