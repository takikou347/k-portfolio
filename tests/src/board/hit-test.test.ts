import { describe, expect, it } from 'vitest';
import { distToSegment, strokeHitsPoint } from '../../../src/board/hit-test';
import type { Stroke } from '../../../shared/schema';

describe('distToSegment', () => {
  it('線分上の点は距離 0', () => {
    expect(distToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
  });

  it('線分の垂線方向の距離を返す', () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
  });

  it('線分の端より外側では端点との距離を返す', () => {
    expect(distToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
  });

  it('長さ 0 の線分 (点) でも動く', () => {
    expect(distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5);
  });
});

describe('strokeHitsPoint', () => {
  const stroke: Stroke = {
    id: 's1',
    color: 'white',
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  };

  it('線分の近く (threshold 以内) はヒットする', () => {
    expect(strokeHitsPoint(stroke, { x: 50, y: 10 }, 14)).toBe(true);
  });

  it('threshold を超えるとヒットしない', () => {
    expect(strokeHitsPoint(stroke, { x: 50, y: 20 }, 14)).toBe(false);
  });

  it('1 点だけのストローク (点打ち) もヒット判定できる', () => {
    const dot: Stroke = { id: 'd', color: 'pink', points: [{ x: 5, y: 5 }] };
    expect(strokeHitsPoint(dot, { x: 10, y: 5 }, 14)).toBe(true);
    expect(strokeHitsPoint(dot, { x: 40, y: 5 }, 14)).toBe(false);
  });
});
