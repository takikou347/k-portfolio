import { expect, test } from '@playwright/test';
import { openBoard, strokesOn, uniqueBoard } from './helpers';

test('2 つの browser context 間でストロークが同期される', async ({ browser }) => {
  const board = uniqueBoard('e2e-stroke');
  const a = await openBoard(browser, board, 'はなこ');
  const b = await openBoard(browser, board, 'たろう', { color: 'blue' });
  await expect(a.locator('.presence-badge')).toHaveText(/2 人/);

  // A がチョークで描く
  await a.mouse.move(400, 300);
  await a.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await a.mouse.move(400 + i * 15, 300 + Math.sin(i / 2) * 40);
  }
  await a.mouse.up();
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '1');

  // B に同期される
  await expect(strokesOn(b)).toHaveAttribute('data-strokes', '1');

  // B が黒板消しで消すと A からも消える (ストローク単位の削除)
  await b.getByRole('button', { name: '黒板消し' }).click();
  await b.mouse.move(400, 300);
  await b.mouse.down();
  for (let x = 400; x <= 600; x += 10) {
    await b.mouse.move(x, 300 + Math.sin((x - 400) / 30) * 40);
  }
  await b.mouse.up();
  await expect(strokesOn(b)).toHaveAttribute('data-strokes', '0');
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '0');
});
