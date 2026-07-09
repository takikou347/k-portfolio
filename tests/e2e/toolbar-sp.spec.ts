import { expect, test } from '@playwright/test';
import { openBoard, strokesOn, uniqueBoard } from './helpers';

test('375px ビューポートで入室してツールバー操作ができる', async ({ browser }) => {
  const board = uniqueBoard('e2e-sp');
  // 名前入力 (ボトムシート) を通って入室する
  const page = await openBoard(browser, board, 'すみれ', {
    throughDialog: true,
    contextOptions: {
      viewport: { width: 375, height: 667 },
      hasTouch: true,
      isMobile: true,
    },
  });

  // 桃チョークを選ぶ (選択中チョークが浮き上がる = aria-pressed)
  const pink = page.getByRole('button', { name: '桃チョーク' });
  await pink.tap();
  await expect(pink).toHaveAttribute('aria-pressed', 'true');

  // 1 本指タップで点を打てる
  await page.touchscreen.tap(190, 300);
  await expect(strokesOn(page)).toHaveAttribute('data-strokes', '1');

  // 黒板消しに切り替えて消せる
  const eraser = page.getByRole('button', { name: '黒板消し' });
  await eraser.tap();
  await expect(eraser).toHaveAttribute('aria-pressed', 'true');
  await page.touchscreen.tap(190, 300);
  await expect(strokesOn(page)).toHaveAttribute('data-strokes', '0');

  // リアクションボタンも横スクロールで届き、タップで演出が出る
  const tray = page.locator('.tray');
  await tray.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await page.getByRole('button', { name: 'リアクション 👏' }).tap();
  await expect(page.locator('.reaction-pop')).toBeVisible();
});
