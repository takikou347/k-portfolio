import {
  CURSORS_PER_SECOND,
  OPS_PER_SECOND,
  REACTIONS_PER_SECOND,
  STROKINGS_PER_SECOND,
} from '../shared/limits';

export type RateKind = 'op' | 'cursor' | 'reaction' | 'stroking';

const LIMITS: Record<RateKind, number> = {
  op: OPS_PER_SECOND,
  cursor: CURSORS_PER_SECOND,
  reaction: REACTIONS_PER_SECOND,
  stroking: STROKINGS_PER_SECOND,
};

/**
 * 接続ごとの受信レート制限 (1秒窓)。超過分は呼び出し側で黙って破棄する。
 * メモリ上のカウンタなのでハイバネーションで消えるが、リセットされるだけで安全側。
 */
export class RateLimiter {
  #buckets = new WeakMap<object, { sec: number; counts: Record<RateKind, number> }>();

  /** now はミリ秒 (Date.now())。テストのために注入可能にしている */
  allow(key: object, kind: RateKind, now: number): boolean {
    const sec = Math.floor(now / 1000);
    let bucket = this.#buckets.get(key);
    if (!bucket || bucket.sec !== sec) {
      bucket = { sec, counts: { op: 0, cursor: 0, reaction: 0, stroking: 0 } };
      this.#buckets.set(key, bucket);
    }
    bucket.counts[kind] += 1;
    return bucket.counts[kind] <= LIMITS[kind];
  }
}
