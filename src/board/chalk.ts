import type { ChalkColor, Point } from '../../shared/schema';

/** トークン (CSS カスタムプロパティ) の値を canvas 用に解決する。hex を二重管理しない */
let colorCache: Record<ChalkColor, string> | null = null;

export function chalkCssColor(color: ChalkColor): string {
  if (!colorCache) {
    const styles = getComputedStyle(document.documentElement);
    colorCache = {
      white: styles.getPropertyValue('--color-chalk-white').trim(),
      pink: styles.getPropertyValue('--color-chalk-pink').trim(),
      yellow: styles.getPropertyValue('--color-chalk-yellow').trim(),
      blue: styles.getPropertyValue('--color-chalk-blue').trim(),
    };
  }
  return colorCache[color];
}

/** 文字列 → 32bit シード */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 決定的な乱数列。再描画してもかすれの模様が変わらないよう stroke id でシードする */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** チョークの描き味: 低透明度の重ね描き + わずかなジッター */
function chalkSegment(ctx: CanvasRenderingContext2D, a: Point, b: Point, rng: () => number): void {
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 3.4 - i;
    ctx.beginPath();
    ctx.moveTo(a.x + (rng() - 0.5) * 1.6, a.y + (rng() - 0.5) * 1.6);
    ctx.lineTo(b.x + (rng() - 0.5) * 1.6, b.y + (rng() - 0.5) * 1.6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

type DrawableStroke = {
  id: string;
  color: ChalkColor;
  points: readonly Point[];
};

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: DrawableStroke): void {
  const rng = mulberry32(hashString(stroke.id));
  ctx.strokeStyle = chalkCssColor(stroke.color);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineCap = 'round';
  const pts = stroke.points;
  if (pts.length === 1) {
    // 点打ち: 小さなチョークの点
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  for (let i = 1; i < pts.length; i++) {
    chalkSegment(ctx, pts[i - 1], pts[i], rng);
  }
}
