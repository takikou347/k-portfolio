import { describe, expect, it } from 'vitest';
import { distSqToSegment, segSegDistSq } from '../../shared/geometry';

describe('distSqToSegment (点と線分の距離の 2 乗)', () => {
  it('線分上の点は距離 0', () => {
    expect(distSqToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
  });

  it('線分の垂線方向の距離を返す', () => {
    expect(distSqToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(9);
  });

  it('線分の端より外側では端点との距離を返す', () => {
    expect(distSqToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(25);
  });

  it('長さ 0 の線分 (点) でも動く', () => {
    expect(distSqToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(25);
  });
});

describe('segSegDistSq (線分同士の距離の 2 乗)', () => {
  it('交差する線分は距離 0', () => {
    expect(segSegDistSq({ x: 0, y: -5 }, { x: 0, y: 5 }, { x: -5, y: 0 }, { x: 5, y: 0 })).toBe(0);
  });

  it('平行な線分は垂線方向の距離を返す', () => {
    expect(
      segSegDistSq({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 4 }, { x: 10, y: 4 }),
    ).toBeCloseTo(16);
  });

  it('離れた線分は最寄りの端点間の距離を返す', () => {
    expect(
      segSegDistSq({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 13, y: 4 }, { x: 20, y: 4 }),
    ).toBeCloseTo(25);
  });

  it('端点で接する線分は距離 0', () => {
    expect(segSegDistSq({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 })).toBe(
      0,
    );
  });
});
