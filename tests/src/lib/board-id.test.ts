import { describe, expect, it } from 'vitest';
import { boardIdFromPath, isBoardId, randomBoardId } from '../../../src/lib/board-id';

describe('isBoardId (ボード ID の形式)', () => {
  it('英数字・ハイフン・アンダースコア 1〜64 文字を受け入れる', () => {
    expect(isBoardId('main')).toBe(true);
    expect(isBoardId('A-1_b')).toBe(true);
    expect(isBoardId('a'.repeat(64))).toBe(true);
  });

  it('空文字・65 文字・記号・日本語は拒否する', () => {
    expect(isBoardId('')).toBe(false);
    expect(isBoardId('a'.repeat(65))).toBe(false);
    expect(isBoardId('a/b')).toBe(false);
    expect(isBoardId('こくばん')).toBe(false);
  });
});

describe('boardIdFromPath (URL からの導出)', () => {
  it('/b/<id> から id を取り出す', () => {
    expect(boardIdFromPath('/b/asobi-123')).toBe('asobi-123');
  });

  it('ルート・不正な形式・深いパスは main にフォールバックする', () => {
    expect(boardIdFromPath('/')).toBe('main');
    expect(boardIdFromPath('/b/')).toBe('main');
    expect(boardIdFromPath('/b/あいう')).toBe('main');
    expect(boardIdFromPath('/b/a/b')).toBe('main');
    expect(boardIdFromPath(`/b/${'a'.repeat(65)}`)).toBe('main');
  });
});

describe('randomBoardId (新しい黒板の ID)', () => {
  it('生成した ID はボード ID として有効で、見間違えやすい文字を含まない', () => {
    for (let i = 0; i < 50; i++) {
      const id = randomBoardId();
      expect(id).toHaveLength(8);
      expect(isBoardId(id)).toBe(true);
      expect(id).not.toMatch(/[il1o0]/);
    }
  });
});
