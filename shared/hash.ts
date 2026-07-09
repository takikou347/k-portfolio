/** 文字列 → 32bit ハッシュ (FNV-1a)。チョークのかすれ模様のシードと断片 id の生成に使う */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
