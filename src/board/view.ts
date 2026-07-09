import { ZOOM_MAX, ZOOM_MIN } from '../../shared/limits';

/** パン/ズーム状態。x, y は画面座標でのオフセット、scale は倍率 (0.5〜2) */
export type View = { x: number; y: number; scale: number };

export type Point = { x: number; y: number };

export function clampScale(scale: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/** 画面座標 → ボード座標。イベント処理の外へは常にボード座標で渡す */
export function screenToBoard(view: View, p: Point): Point {
  return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
}

export function boardToScreen(view: View, p: Point): Point {
  return { x: p.x * view.scale + view.x, y: p.y * view.scale + view.y };
}

/** center (画面座標) の下にあるボード上の点を固定したままズームする */
export function zoomAt(view: View, center: Point, nextScale: number): View {
  const scale = clampScale(nextScale);
  const anchor = screenToBoard(view, center);
  return { x: center.x - anchor.x * scale, y: center.y - anchor.y * scale, scale };
}
