import { expect, test } from '@playwright/test';
import { openBoard, strokesOn, uniqueBoard } from './helpers';

test('スライドした分だけ左から消え、他のブラウザにも同期される', async ({ browser }) => {
  const board = uniqueBoard('e2e-wipe');
  const a = await openBoard(browser, board, 'はなこ');
  const b = await openBoard(browser, board, 'たろう', { color: 'blue' });
  await expect(a.locator('.presence-badge')).toHaveText(/2 人/);

  // 左 (x=300..360) と右 (x=700..760) に 1 本ずつ描く (初期表示は ボード座標 = 画面座標)
  const draw = async (x1: number, x2: number) => {
    await a.mouse.move(x1, 300);
    await a.mouse.down();
    await a.mouse.move(x2, 300);
    await a.mouse.up();
  };
  await draw(300, 360);
  await draw(700, 760);
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '2');
  await expect(strokesOn(b)).toHaveAttribute('data-strokes', '2');

  // 拭き取りバーを開き、ハンドルを右へ 250px スライド → 拭き取りラインは
  // 内容の左端 (x=300) から 250 進み、左の線だけが消える
  await a.getByRole('button', { name: 'ぜんぶ消す (スライドで消す)' }).click();
  const handle = a.getByRole('slider');
  const box = await handle.boundingBox();
  if (!box) throw new Error('handle not visible');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await a.mouse.move(cx, cy);
  await a.mouse.down();
  for (let i = 1; i <= 25; i++) {
    await a.mouse.move(cx + i * 10, cy);
  }
  await a.mouse.up();

  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '1');
  // 他のブラウザにも同期され、途中でやめた消去はそのまま確定する
  await expect(strokesOn(b)).toHaveAttribute('data-strokes', '1');
  await a.getByRole('button', { name: '拭き取りバーを閉じる' }).click();
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '1');
});
