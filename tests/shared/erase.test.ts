import { describe, expect, it } from 'vitest';
import { eraseStrokePath, fragmentId, strokeTouchesPath } from '../../shared/erase';
import type { Stroke } from '../../shared/schema';

/** x 軸上に 10px 間隔で n 点並ぶ直線ストローク (x = 0, 10, ..., (n-1)*10) */
function line(id: string, n: number): Stroke {
  return {
    id,
    color: 'white',
    points: Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0 })),
  };
}

describe('strokeTouchesPath (消しゴム軌跡との接触判定)', () => {
  it('軌跡の半径内にストロークがあれば触れていると判定する', () => {
    const s = line('s1', 11);
    expect(strokeTouchesPath(s, [{ x: 50, y: 4 }], 5)).toBe(true);
  });

  it('半径の外なら触れていない', () => {
    const s = line('s1', 11);
    expect(strokeTouchesPath(s, [{ x: 50, y: 100 }], 5)).toBe(false);
  });

  it('軌跡が線分 (2 点以上) のときはカプセル領域で判定する', () => {
    const s = line('s1', 11);
    // 軌跡はストロークの上を横切る縦線。中間点そのものは半径外でも触れる
    expect(
      strokeTouchesPath(
        s,
        [
          { x: 55, y: -20 },
          { x: 55, y: 20 },
        ],
        3,
      ),
    ).toBe(true);
  });

  it('点打ち (1 点) のストロークも判定できる', () => {
    const dot: Stroke = { id: 'd', color: 'pink', points: [{ x: 5, y: 5 }] };
    expect(strokeTouchesPath(dot, [{ x: 8, y: 5 }], 5)).toBe(true);
    expect(strokeTouchesPath(dot, [{ x: 50, y: 5 }], 5)).toBe(false);
  });
});

describe('eraseStrokePath (部分消し・分割)', () => {
  it('触れていなければ null を返す (呼び出し側は元の参照を使う)', () => {
    expect(eraseStrokePath(line('s1', 11), [{ x: 50, y: 100 }], 5)).toBeNull();
  });

  it('全体が半径内なら空配列 (全消し)', () => {
    expect(eraseStrokePath(line('s1', 3), [{ x: 10, y: 0 }], 50)).toEqual([]);
  });

  it('中央をなぞると前後 2 本の断片に分かれ、触れていない点は保持される', () => {
    const s = line('s1', 11); // x = 0..100
    const fragments = eraseStrokePath(s, [{ x: 50, y: 0 }], 5);
    expect(fragments).not.toBeNull();
    if (!fragments) return;
    expect(fragments).toHaveLength(2);
    expect(fragments[0].points).toEqual(s.points.slice(0, 5));
    expect(fragments[1].points).toEqual(s.points.slice(6));
    expect(fragments[0].color).toBe('white');
    // 断片 id は親 id + 区間開始 index から決定的に生成される
    expect(fragments[0].id).toBe(fragmentId('s1', 0));
    expect(fragments[1].id).toBe(fragmentId('s1', 6));
    expect(fragments[0].id).not.toBe(fragments[1].id);
  });

  it('先頭を消すと残り 1 本になり、id は元と変わる (op の重複適用と区別するため)', () => {
    const s = line('s1', 11);
    const fragments = eraseStrokePath(s, [{ x: 0, y: 0 }], 5);
    expect(fragments).not.toBeNull();
    if (!fragments) return;
    expect(fragments).toHaveLength(1);
    expect(fragments[0].points).toEqual(s.points.slice(1));
    expect(fragments[0].id).toBe(fragmentId('s1', 1));
    expect(fragments[0].id).not.toBe('s1');
  });

  it('両端の点が半径外でも、間の線分が軌跡を横切るなら分割される (点の間隔が広い高速ストローク)', () => {
    const s: Stroke = {
      id: 'fast',
      color: 'blue',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    };
    const fragments = eraseStrokePath(s, [{ x: 50, y: 3 }], 5);
    expect(fragments).not.toBeNull();
    if (!fragments) return;
    expect(fragments).toHaveLength(2);
    expect(fragments[0].points).toEqual([{ x: 0, y: 0 }]);
    expect(fragments[1].points).toEqual([{ x: 100, y: 0 }]);
  });

  it('点打ち (1 点) のストロークは触れたら全消し', () => {
    const dot: Stroke = { id: 'd', color: 'pink', points: [{ x: 5, y: 5 }] };
    expect(eraseStrokePath(dot, [{ x: 7, y: 5 }], 5)).toEqual([]);
    expect(eraseStrokePath(dot, [{ x: 50, y: 5 }], 5)).toBeNull();
  });

  it('軌跡 (複数点) に沿ってなぞると全体が消える', () => {
    const s = line('s1', 11);
    const fragments = eraseStrokePath(
      s,
      [
        { x: 0, y: 3 },
        { x: 100, y: 3 },
      ],
      5,
    );
    expect(fragments).toEqual([]);
  });
});

describe('fragmentId (断片 id の決定的生成)', () => {
  it('同じ入力からは常に同じ id が生成される', () => {
    expect(fragmentId('parent-1', 3)).toBe(fragmentId('parent-1', 3));
  });

  it('親 id や区間 index が違えば id も変わる', () => {
    expect(fragmentId('parent-1', 3)).not.toBe(fragmentId('parent-1', 4));
    expect(fragmentId('parent-1', 3)).not.toBe(fragmentId('parent-2', 3));
  });

  it('id はスキーマの上限 (64 文字) に収まる固定長', () => {
    const id = fragmentId('x'.repeat(64), 599);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id.length).toBe(fragmentId('a', 0).length);
  });
});
