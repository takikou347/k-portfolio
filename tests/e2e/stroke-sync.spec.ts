import { expect, test } from '@playwright/test';
import { openBoard, strokesOn, uniqueBoard } from './helpers';

test('2 つの browser context 間でストロークが同期される', async ({ browser }) => {
  const board = uniqueBoard('e2e-stroke');
  const a = await openBoard(browser, board, 'はなこ');
  const b = await openBoard(browser, board, 'たろう', { color: 'blue' });
  await expect(a.locator('.presence-badge')).toHaveText(/2 人/);

  // A がチョークで水平な直線を描く
  await a.mouse.move(400, 300);
  await a.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await a.mouse.move(400 + i * 15, 300);
  }
  await a.mouse.up();
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '1');

  // B に同期される
  await expect(strokesOn(b)).toHaveAttribute('data-strokes', '1');

  // B が黒板消しで中央をなぞると、触れた部分だけ消えて 2 本に分かれる (部分消し)
  await b.getByRole('button', { name: '黒板消し' }).click();
  await b.mouse.move(490, 300);
  await b.mouse.down();
  await b.mouse.move(495, 300);
  await b.mouse.up();
  await expect(strokesOn(b)).toHaveAttribute('data-strokes', '2');
  // A にも部分消しが同期される
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '2');

  // 線の全体をなぞると全部消える
  await b.mouse.move(380, 300);
  await b.mouse.down();
  for (let x = 380; x <= 600; x += 10) {
    await b.mouse.move(x, 300);
  }
  await b.mouse.up();
  await expect(strokesOn(b)).toHaveAttribute('data-strokes', '0');
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '0');
});

test('画面外でボタンを離しても (pointerup 消失) ドラッグ判定が残らない', async ({ browser }) => {
  const board = uniqueBoard('e2e-stuck-drag');
  const a = await openBoard(browser, board, 'はなこ');

  // チョークでドラッグ開始
  await a.mouse.move(400, 300);
  await a.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await a.mouse.move(400 + i * 15, 300);
  }

  // 画面外でボタンを離した状況を再現: pointerup は届かず、
  // ボタン非押下 (buttons: 0) の pointermove だけが届く
  const ghostMove = (x: number, y: number) =>
    strokesOn(a).dispatchEvent('pointermove', {
      pointerId: 1,
      isPrimary: true,
      buttons: 0,
      clientX: x,
      clientY: y,
    });
  await ghostMove(700, 300);

  // 描きかけはその時点で確定され 1 本になる (描き続けない)
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '1');

  // 戻ってきてマウスを動かしても、押していない限り新たに描かれない
  for (let i = 0; i <= 6; i++) {
    await ghostMove(400 + i * 20, 400);
  }
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '1');
});
