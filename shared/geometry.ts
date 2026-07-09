import type { Point } from './schema';

/**
 * 距離はすべて 2 乗値で扱う。Math.hypot / sqrt はエンジンごとに丸めが異なりうるため、
 * クライアントと DO で結果を一致させる必要がある判定は四則演算だけで行う。
 */

/** 点 p と線分 ab の距離の 2 乗 */
export function distSqToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const ex = p.x - (a.x + t * dx);
  const ey = p.y - (a.y + t * dy);
  return ex * ex + ey * ey;
}

/** 外積の符号 (a→b に対する c の向き) */
function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** 線分 ab と線分 cd が真に交差するか (端点接触・共線は距離計算側が 0 を返す) */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** 線分 ab と線分 cd の距離の 2 乗 (交差していれば 0) */
export function segSegDistSq(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(
    distSqToSegment(a, c, d),
    distSqToSegment(b, c, d),
    distSqToSegment(c, a, b),
    distSqToSegment(d, a, b),
  );
}
