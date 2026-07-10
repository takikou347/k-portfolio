import { describe, expect, it } from 'vitest';
import { pushVisited, VISITED_BOARDS_MAX } from '../../../src/lib/boards';

describe('pushVisited (黒板の訪問履歴)', () => {
  it('新しい id が先頭に追加される', () => {
    expect(pushVisited(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('既に履歴にある id は先頭へ繰り上がる (重複しない)', () => {
    expect(pushVisited(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('不正な id は追加されず、履歴に紛れた不正な値も掃除される', () => {
    expect(pushVisited(['a', 'こくばん'], 'x/y')).toEqual(['a']);
  });

  it('上限を超えると末尾 (最も古いもの) から押し出される', () => {
    const full = Array.from({ length: VISITED_BOARDS_MAX }, (_, i) => `b${i}`);
    const next = pushVisited(full, 'new');
    expect(next).toHaveLength(VISITED_BOARDS_MAX);
    expect(next[0]).toBe('new');
    expect(next).not.toContain(`b${VISITED_BOARDS_MAX - 1}`);
  });
});
