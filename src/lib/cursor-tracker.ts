import type { Point } from '../../shared/schema';

/**
 * 自分のカーソルの最新ボード座標。リアクションの発生位置に使う。
 * 60fps で更新されるため、再レンダリングを起こさないよう store の外に置く。
 */
let lastCursor: Point | null = null;

export function setLastCursor(p: Point): void {
  lastCursor = p;
}

export function getLastCursor(): Point | null {
  return lastCursor;
}
