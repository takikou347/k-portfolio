import {
  STICKY_FONT_MAX,
  STICKY_FONT_MIN,
  STICKY_H_MAX,
  STICKY_H_MIN,
  STICKY_W_MAX,
  STICKY_W_MIN,
} from '../../shared/limits';
import type { PaperColor, Sticky } from '../../shared/schema';

export const PAPER_COLORS: readonly PaperColor[] = ['cream', 'rose', 'sky'];

export const PAPER_LABELS: Record<PaperColor, string> = {
  cream: 'クリーム',
  rose: 'もも',
  sky: 'そら',
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * 付箋のサイズ・文字サイズを step ぶん増減し、範囲内にクランプした新しい寸法を返す。
 * resizeSticky op のペイロードにそのまま使う (Desktop / SP 共用でクランプを一元化)。
 */
export function nextStickyDims(sticky: Sticky, sizeDelta: number, fontDelta: number) {
  return {
    w: clamp(sticky.w + sizeDelta, STICKY_W_MIN, STICKY_W_MAX),
    h: clamp(sticky.h + sizeDelta, STICKY_H_MIN, STICKY_H_MAX),
    fontSize: clamp(sticky.fontSize + fontDelta, STICKY_FONT_MIN, STICKY_FONT_MAX),
  };
}
