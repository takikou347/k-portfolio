import { describe, expect, it } from 'vitest';
import { CURSORS_PER_SECOND, OPS_PER_SECOND } from '../../shared/limits';
import { RateLimiter } from '../../worker/rate-limit';

describe('RateLimiter', () => {
  it('op は 20 件/秒まで許可し、21 件目から破棄する', () => {
    const limiter = new RateLimiter();
    const key = {};
    const t = 1_000_000;
    for (let i = 0; i < OPS_PER_SECOND; i++) {
      expect(limiter.allow(key, 'op', t + i)).toBe(true);
    }
    expect(limiter.allow(key, 'op', t + OPS_PER_SECOND)).toBe(false);
  });

  it('cursor は 15 件/秒まで許可する', () => {
    const limiter = new RateLimiter();
    const key = {};
    const t = 2_000_000;
    for (let i = 0; i < CURSORS_PER_SECOND; i++) {
      expect(limiter.allow(key, 'cursor', t)).toBe(true);
    }
    expect(limiter.allow(key, 'cursor', t)).toBe(false);
  });

  it('次の 1 秒窓に入るとカウンタがリセットされる', () => {
    const limiter = new RateLimiter();
    const key = {};
    const t = 3_000_000;
    for (let i = 0; i <= OPS_PER_SECOND; i++) limiter.allow(key, 'op', t);
    expect(limiter.allow(key, 'op', t)).toBe(false);
    expect(limiter.allow(key, 'op', t + 1000)).toBe(true);
  });

  it('接続 (key) ごとに独立して数える', () => {
    const limiter = new RateLimiter();
    const a = {};
    const b = {};
    const t = 4_000_000;
    for (let i = 0; i <= OPS_PER_SECOND; i++) limiter.allow(a, 'op', t);
    expect(limiter.allow(a, 'op', t)).toBe(false);
    expect(limiter.allow(b, 'op', t)).toBe(true);
  });

  it('kind ごとに独立して数える', () => {
    const limiter = new RateLimiter();
    const key = {};
    const t = 5_000_000;
    for (let i = 0; i <= CURSORS_PER_SECOND; i++) limiter.allow(key, 'cursor', t);
    expect(limiter.allow(key, 'cursor', t)).toBe(false);
    expect(limiter.allow(key, 'op', t)).toBe(true);
  });
});
