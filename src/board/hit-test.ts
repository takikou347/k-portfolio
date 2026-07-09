import type { Point, Stroke } from '../../shared/schema';

/** 点 p と線分 ab の距離 */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 黒板消しのヒットテスト: ストロークのいずれかの線分が threshold 以内にあるか */
export function strokeHitsPoint(stroke: Stroke, p: Point, threshold: number): boolean {
  const pts = stroke.points;
  if (pts.length === 1) {
    return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= threshold;
  }
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(p, pts[i - 1], pts[i]) <= threshold) return true;
  }
  return false;
}
