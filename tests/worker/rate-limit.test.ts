import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { BOARD_API_PER_WINDOW, CURSORS_PER_SECOND, OPS_PER_SECOND } from '../../shared/limits';
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

describe('/api/boards の IP ごとレート制限 (Worker 側)', () => {
  it('同一 IP は窓内 20 リクエストまで許可し、21 件目から 429 を返す', async () => {
    const headers = { 'CF-Connecting-IP': '203.0.113.9' };
    for (let i = 0; i < BOARD_API_PER_WINDOW; i++) {
      const res = await SELF.fetch(`https://example.com/api/boards/rate-${i}`, { headers });
      expect(res.status).toBe(200);
    }
    const blocked = await SELF.fetch('https://example.com/api/boards/rate-over', { headers });
    expect(blocked.status).toBe(429);
    // 別 IP は影響を受けない
    const other = await SELF.fetch('https://example.com/api/boards/rate-other', {
      headers: { 'CF-Connecting-IP': '203.0.113.10' },
    });
    expect(other.status).toBe(200);
  });
});
