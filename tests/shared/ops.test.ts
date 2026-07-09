import { describe, expect, it } from 'vitest';
import { MAX_STICKIES, MAX_STROKES } from '../../shared/limits';
import { applyOp, emptyBoardState, type BoardState } from '../../shared/ops';
import type { Sticky, Stroke } from '../../shared/schema';

function stroke(id: string): Stroke {
  return {
    id,
    color: 'white',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
  };
}

function sticky(id: string): Sticky {
  return { id, x: 100, y: 100, color: 'cream', text: 'めも', w: 180, h: 140, fontSize: 15 };
}

describe('applyOp: addStroke', () => {
  it('ストロークが追加される', () => {
    const next = applyOp(emptyBoardState(), { type: 'addStroke', stroke: stroke('s1') });
    expect(next.strokes).toHaveLength(1);
    expect(next.strokes[0].id).toBe('s1');
  });

  it('同じ id の二重追加は無視される (冪等)', () => {
    const s1 = applyOp(emptyBoardState(), { type: 'addStroke', stroke: stroke('s1') });
    const s2 = applyOp(s1, { type: 'addStroke', stroke: stroke('s1') });
    expect(s2.strokes).toHaveLength(1);
  });

  it('上限 (2000 本) を超えると古い順に間引かれる', () => {
    let state: BoardState = emptyBoardState();
    for (let i = 0; i < MAX_STROKES; i++) {
      state = applyOp(state, { type: 'addStroke', stroke: stroke(`s${i}`) });
    }
    expect(state.strokes).toHaveLength(MAX_STROKES);
    state = applyOp(state, { type: 'addStroke', stroke: stroke('overflow') });
    expect(state.strokes).toHaveLength(MAX_STROKES);
    expect(state.strokes[0].id).toBe('s1'); // 最古の s0 が間引かれる
    expect(state.strokes.at(-1)?.id).toBe('overflow');
  });

  it('元の state は変更されない (イミュータブル)', () => {
    const before = emptyBoardState();
    applyOp(before, { type: 'addStroke', stroke: stroke('s1') });
    expect(before.strokes).toHaveLength(0);
  });
});

describe('applyOp: eraseStroke', () => {
  it('指定した id のストロークだけが消える', () => {
    let state = applyOp(emptyBoardState(), { type: 'addStroke', stroke: stroke('s1') });
    state = applyOp(state, { type: 'addStroke', stroke: stroke('s2') });
    state = applyOp(state, { type: 'eraseStroke', strokeId: 's1' });
    expect(state.strokes.map((s) => s.id)).toEqual(['s2']);
  });

  it('存在しない id への erase は無視され、state は同一参照のまま', () => {
    const state = applyOp(emptyBoardState(), { type: 'addStroke', stroke: stroke('s1') });
    const next = applyOp(state, { type: 'eraseStroke', strokeId: 'nope' });
    expect(next).toBe(state);
  });
});

describe('applyOp: eraseArea (部分消し)', () => {
  /** x 軸上に 10px 間隔で n 点並ぶ直線ストローク */
  function line(id: string, n: number, y = 0): Stroke {
    return {
      id,
      color: 'white',
      points: Array.from({ length: n }, (_, i) => ({ x: i * 10, y })),
    };
  }

  it('触れた部分だけが消え、ストロークが分割される。触れていないストロークは同一参照のまま', () => {
    let state = applyOp(emptyBoardState(), { type: 'addStroke', stroke: line('target', 11) });
    state = applyOp(state, { type: 'addStroke', stroke: line('far', 11, 1000) });
    const far = state.strokes[1];
    const next = applyOp(state, { type: 'eraseArea', points: [{ x: 50, y: 0 }], r: 5 });
    expect(next.strokes).toHaveLength(3); // target が 2 断片に分割 + far
    expect(next.strokes.filter((s) => s.id !== 'far').every((s) => s.points.length === 5)).toBe(
      true,
    );
    // 消しゴムに触れた x=50 の点はどの断片にも残らない
    expect(next.strokes.some((s) => s.points.some((p) => p.x === 50 && p.y === 0))).toBe(false);
    // 断片は末尾に追加され、触れていないストロークが先頭に繰り上がる
    // (SQLite の追記順と配列の並びを一致させ、DO 再起動後も順序がズレないようにする)
    expect(next.strokes[0]).toBe(far);
  });

  it('どのストロークにも触れない eraseArea は無視され、state は同一参照のまま', () => {
    const state = applyOp(emptyBoardState(), { type: 'addStroke', stroke: line('s1', 11) });
    const next = applyOp(state, { type: 'eraseArea', points: [{ x: 50, y: 500 }], r: 5 });
    expect(next).toBe(state);
  });

  it('分割で上限 (2000 本) を超えたら古い順に間引かれる', () => {
    let state = applyOp(emptyBoardState(), { type: 'addStroke', stroke: line('target', 11) });
    for (let i = 0; i < MAX_STROKES - 1; i++) {
      state = applyOp(state, {
        type: 'addStroke',
        stroke: { id: `dot${i}`, color: 'white', points: [{ x: i, y: 5000 }] },
      });
    }
    expect(state.strokes).toHaveLength(MAX_STROKES);
    const next = applyOp(state, { type: 'eraseArea', points: [{ x: 50, y: 0 }], r: 5 });
    // 断片 2 本が末尾に追加されて 2001 本になるため、最古の dot0 が間引かれる
    expect(next.strokes).toHaveLength(MAX_STROKES);
    expect(next.strokes[0].id).toBe('dot1');
    expect(next.strokes.at(-2)?.points).toEqual(line('target', 11).points.slice(0, 5));
    expect(next.strokes.at(-1)?.points).toEqual(line('target', 11).points.slice(6));
  });
});

describe('applyOp: 付箋 (addSticky / moveSticky / editSticky / recolorSticky / deleteSticky)', () => {
  it('addSticky で付箋が追加される', () => {
    const next = applyOp(emptyBoardState(), { type: 'addSticky', sticky: sticky('n1') });
    expect(next.stickies).toHaveLength(1);
    expect(next.stickies[0].text).toBe('めも');
  });

  it('同じ id の addSticky は無視される (冪等)', () => {
    const s1 = applyOp(emptyBoardState(), { type: 'addSticky', sticky: sticky('n1') });
    const s2 = applyOp(s1, { type: 'addSticky', sticky: sticky('n1') });
    expect(s2.stickies).toHaveLength(1);
  });

  it('付箋の上限を超える addSticky は無視される', () => {
    let state: BoardState = emptyBoardState();
    for (let i = 0; i < MAX_STICKIES; i++) {
      state = applyOp(state, { type: 'addSticky', sticky: sticky(`n${i}`) });
    }
    const next = applyOp(state, { type: 'addSticky', sticky: sticky('over') });
    expect(next).toBe(state);
    expect(next.stickies).toHaveLength(MAX_STICKIES);
  });

  it('moveSticky で座標だけが変わる', () => {
    const s1 = applyOp(emptyBoardState(), { type: 'addSticky', sticky: sticky('n1') });
    const next = applyOp(s1, { type: 'moveSticky', id: 'n1', x: 5, y: -8 });
    expect(next.stickies[0]).toEqual({ ...sticky('n1'), x: 5, y: -8 });
  });

  it('存在しない付箋への move は無視される', () => {
    const state = applyOp(emptyBoardState(), { type: 'addSticky', sticky: sticky('n1') });
    const next = applyOp(state, { type: 'moveSticky', id: 'ghost', x: 1, y: 1 });
    expect(next).toBe(state);
  });

  it('存在しない付箋への edit / recolor は無視される', () => {
    const state = applyOp(emptyBoardState(), { type: 'addSticky', sticky: sticky('n1') });
    expect(applyOp(state, { type: 'editSticky', id: 'ghost', text: 'x' })).toBe(state);
    expect(applyOp(state, { type: 'recolorSticky', id: 'ghost', color: 'sky' })).toBe(state);
  });

  it('editSticky でテキストが、recolorSticky で色が変わる', () => {
    let state = applyOp(emptyBoardState(), { type: 'addSticky', sticky: sticky('n1') });
    state = applyOp(state, { type: 'editSticky', id: 'n1', text: 'かきなおし' });
    expect(state.stickies[0].text).toBe('かきなおし');
    state = applyOp(state, { type: 'recolorSticky', id: 'n1', color: 'sky' });
    expect(state.stickies[0].color).toBe('sky');
  });

  it('deleteSticky で削除され、存在しない id は無視される', () => {
    const state = applyOp(emptyBoardState(), { type: 'addSticky', sticky: sticky('n1') });
    const gone = applyOp(state, { type: 'deleteSticky', id: 'n1' });
    expect(gone.stickies).toHaveLength(0);
    expect(applyOp(gone, { type: 'deleteSticky', id: 'n1' })).toBe(gone);
  });

  it('resizeSticky で w/h/fontSize だけが変わる', () => {
    const state = applyOp(emptyBoardState(), { type: 'addSticky', sticky: sticky('n1') });
    const next = applyOp(state, { type: 'resizeSticky', id: 'n1', w: 240, h: 200, fontSize: 22 });
    expect(next.stickies[0]).toEqual({ ...sticky('n1'), w: 240, h: 200, fontSize: 22 });
  });

  it('存在しない付箋への resizeSticky は無視される (同一参照を返す)', () => {
    const state = applyOp(emptyBoardState(), { type: 'addSticky', sticky: sticky('n1') });
    expect(
      applyOp(state, { type: 'resizeSticky', id: 'ghost', w: 200, h: 200, fontSize: 20 }),
    ).toBe(state);
  });
});
