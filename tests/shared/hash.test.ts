import { describe, expect, it } from 'vitest';
import { hashString } from '../../shared/hash';

describe('hashString (FNV-1a 32bit)', () => {
  it('既知の入力に対する値が変わらない (断片 id とかすれ模様の安定性)', () => {
    // FNV-1a の標準テストベクタ。ここが変わると既存盤面の断片 id 生成が壊れる
    expect(hashString('')).toBe(2166136261);
    expect(hashString('a')).toBe(0xe40c292c);
  });

  it('マルチバイト文字列でも決定的に同じ値を返す', () => {
    expect(hashString('こくばん')).toBe(hashString('こくばん'));
    expect(hashString('こくばん')).not.toBe(hashString('こくばん!'));
  });
});
