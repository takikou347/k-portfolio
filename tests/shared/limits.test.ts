import { describe, expect, it } from 'vitest';
import {
  CURSOR_THROTTLE_MS,
  CURSORS_PER_SECOND,
  MAX_CONNECTIONS,
  MAX_STROKES,
  NAME_MAX,
  NAME_MIN,
  OPS_PER_SECOND,
  REACTIONS_PER_SECOND,
  STICKY_TEXT_MAX,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../../shared/limits';

describe('limits', () => {
  it('仕様どおりの上限値が定義されている', () => {
    expect(MAX_CONNECTIONS).toBe(100);
    expect(OPS_PER_SECOND).toBe(20);
    expect(CURSORS_PER_SECOND).toBe(15);
    expect(REACTIONS_PER_SECOND).toBe(3);
    expect(MAX_STROKES).toBe(2000);
    expect(STICKY_TEXT_MAX).toBe(80);
  });

  it('名前とズームの範囲が正しい (min < max)', () => {
    expect(NAME_MIN).toBe(2);
    expect(NAME_MAX).toBe(8);
    expect(ZOOM_MIN).toBeLessThan(ZOOM_MAX);
    expect(ZOOM_MIN).toBe(0.5);
    expect(ZOOM_MAX).toBe(2);
    expect(CURSOR_THROTTLE_MS).toBe(80);
  });
});
