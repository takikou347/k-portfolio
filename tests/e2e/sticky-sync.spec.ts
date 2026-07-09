import { expect, test } from '@playwright/test';
import { openBoard, uniqueBoard } from './helpers';

test('付箋の作成・編集・移動が同期される', async ({ browser }) => {
  const board = uniqueBoard('e2e-sticky');
  const a = await openBoard(browser, board, 'はなこ');
  const b = await openBoard(browser, board, 'たろう', { color: 'blue' });
  await expect(a.locator('.presence-badge')).toHaveText(/2 人/);

  // A が画用紙ツールで付箋を作り、その場で書く
  await a.getByRole('button', { name: '画用紙 (付箋)' }).click();
  await a.mouse.click(500, 400);
  await expect(a.locator('.paper-editor')).toBeVisible();
  await a.keyboard.type('こんにちは');
  await a.keyboard.press('Escape');
  await expect(a.locator('.paper')).toContainText('こんにちは');

  // B に作成・テキストが同期される
  await expect(b.locator('.paper')).toContainText('こんにちは');

  // B がドラッグ移動すると A と同じ位置になる
  const box = await b.locator('.paper').boundingBox();
  if (!box) throw new Error('paper not found');
  await b.mouse.move(box.x + 90, box.y + 80);
  await b.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await b.mouse.move(box.x + 90 + i * 20, box.y + 80 - i * 8);
  }
  await b.mouse.up();

  const posOf = (page: typeof a) =>
    page.locator('.paper').evaluate((el) => {
      const s = el as HTMLElement;
      return `${s.style.left},${s.style.top}`;
    });
  const finalPos = await posOf(b);
  await expect.poll(() => posOf(a)).toBe(finalPos);
});
