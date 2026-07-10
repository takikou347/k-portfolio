import { distSqToSegment, segSegDistSq } from './geometry';
import { hashString } from './hash';
import type { Point, Stroke } from './schema';

/**
 * 黒板消しの部分消し (eraseArea op) の中核ロジック。
 * 消しゴムの軌跡 path (点列をつないだカプセル領域、半径 r) に触れた部分だけを
 * ストロークから取り除き、残った区間を複数の断片ストロークに分割する。
 * クライアント (楽観的適用) と DO (正) が同じ結果になるよう、全て決定的に計算する。
 */

/**
 * ストロークと軌跡のバウンディングボックスが r 以上離れているか。
 * 触れる可能性がまったくないストロークを距離計算の前に安く弾く
 */
function boundsDisjoint(pts: readonly Point[], path: Point[], r: number): boolean {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of path) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  let sMinX = Infinity;
  let sMinY = Infinity;
  let sMaxX = -Infinity;
  let sMaxY = -Infinity;
  for (const p of pts) {
    if (p.x < sMinX) sMinX = p.x;
    if (p.x > sMaxX) sMaxX = p.x;
    if (p.y < sMinY) sMinY = p.y;
    if (p.y > sMaxY) sMaxY = p.y;
  }
  return sMaxX < minX - r || sMinX > maxX + r || sMaxY < minY - r || sMinY > maxY + r;
}

/** 点 p が軌跡 (カプセル列) に触れるか */
function pointTouchesPath(p: Point, path: Point[], rSq: number): boolean {
  if (path.length === 1) {
    const dx = p.x - path[0].x;
    const dy = p.y - path[0].y;
    return dx * dx + dy * dy <= rSq;
  }
  for (let i = 1; i < path.length; i++) {
    if (distSqToSegment(p, path[i - 1], path[i]) <= rSq) return true;
  }
  return false;
}

/** 線分 ab が軌跡に触れるか */
function segmentTouchesPath(a: Point, b: Point, path: Point[], rSq: number): boolean {
  if (path.length === 1) return distSqToSegment(path[0], a, b) <= rSq;
  for (let i = 1; i < path.length; i++) {
    if (segSegDistSq(a, b, path[i - 1], path[i]) <= rSq) return true;
  }
  return false;
}

/** ストロークが軌跡に触れるか。クライアントが op 送信要否の判定に使う */
export function strokeTouchesPath(stroke: Stroke, path: Point[], r: number): boolean {
  if (boundsDisjoint(stroke.points, path, r)) return false;
  const rSq = r * r;
  const pts = stroke.points;
  if (pts.length === 1) return pointTouchesPath(pts[0], path, rSq);
  for (let i = 1; i < pts.length; i++) {
    if (segmentTouchesPath(pts[i - 1], pts[i], path, rSq)) return true;
  }
  return false;
}

/**
 * 断片 id を親 id + 区間開始 index から決定的に生成する。
 * 全クライアントと DO で同じ id になり、固定長 17 文字で id 上限 (64) に収まる
 */
export function fragmentId(parentId: string, start: number): string {
  const h1 = hashString(`${parentId}#${start}`);
  const h2 = hashString(`${start}#${parentId}`);
  return `f${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/**
 * ストロークから軌跡に触れた部分を取り除き、残った区間の断片を返す。
 * 触れていなければ null (呼び出し側は元の参照を使い続ける)。
 * 変更が生じた場合、断片には常に新しい決定的 id を振る (元 id は盤面から消える)
 */
export function eraseStrokePath(stroke: Stroke, path: Point[], r: number): Stroke[] | null {
  if (boundsDisjoint(stroke.points, path, r)) return null;
  const rSq = r * r;
  const pts = stroke.points;
  if (pts.length === 1) {
    return pointTouchesPath(pts[0], path, rSq) ? [] : null;
  }

  // 触れていない点の連続区間に分割する。両端が残る場合でも、間の線分が
  // 軌跡を横切るならそこで区間を切る (点の間隔が広い高速ストローク対策)
  const runs: { start: number; points: Point[] }[] = [];
  let run: { start: number; points: Point[] } | null = null;
  for (let i = 0; i < pts.length; i++) {
    if (pointTouchesPath(pts[i], path, rSq)) {
      run = null;
      continue;
    }
    if (run !== null && segmentTouchesPath(pts[i - 1], pts[i], path, rSq)) {
      run = null;
    }
    if (run === null) {
      run = { start: i, points: [] };
      runs.push(run);
    }
    run.points.push(pts[i]);
  }

  if (runs.length === 1 && runs[0].points.length === pts.length) return null; // 触れていない
  return runs.map((r2) => ({
    id: fragmentId(stroke.id, r2.start),
    color: stroke.color,
    points: r2.points,
  }));
}
