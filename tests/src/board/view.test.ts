import { describe, expect, it } from 'vitest';
import { ZOOM_MAX, ZOOM_MIN } from '../../../shared/limits';
import { boardToScreen, clampScale, screenToBoard, zoomAt } from '../../../src/board/view';

describe('clampScale', () => {
  it('50%〜200% の範囲に収める', () => {
    expect(clampScale(0.1)).toBe(ZOOM_MIN);
    expect(clampScale(10)).toBe(ZOOM_MAX);
    expect(clampScale(1)).toBe(1);
  });
});

describe('screenToBoard / boardToScreen', () => {
  it('往復変換で元の座標に戻る', () => {
    const view = { x: 120, y: -40, scale: 1.5 };
    const p = { x: 300, y: 200 };
    expect(boardToScreen(view, screenToBoard(view, p))).toEqual(p);
  });

  it('scale=1, offset=0 では恒等変換になる', () => {
    const view = { x: 0, y: 0, scale: 1 };
    expect(screenToBoard(view, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });
});

describe('zoomAt', () => {
  it('ズーム中心の画面上の位置が変わらない (カーソル中心ズーム)', () => {
    const view = { x: 50, y: 60, scale: 1 };
    const center = { x: 400, y: 300 };
    const before = screenToBoard(view, center);
    const after = zoomAt(view, center, 1.6);
    expect(after.scale).toBeCloseTo(1.6);
    const afterBoard = screenToBoard(after, center);
    expect(afterBoard.x).toBeCloseTo(before.x);
    expect(afterBoard.y).toBeCloseTo(before.y);
  });

  it('範囲外へのズームはクランプされる', () => {
    const view = { x: 0, y: 0, scale: 1 };
    expect(zoomAt(view, { x: 0, y: 0 }, 99).scale).toBe(ZOOM_MAX);
    expect(zoomAt(view, { x: 0, y: 0 }, 0.01).scale).toBe(ZOOM_MIN);
  });
});
