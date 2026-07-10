import { expect, test } from '@playwright/test';
import { openBoard, strokesOn, uniqueBoard } from './helpers';

test('黒板スイッチャーで別の黒板へ移動でき、盤面は黒板ごとに独立している', async ({ browser }) => {
  const board = uniqueBoard('e2e-switch');
  const other = `${board}-second`;
  const a = await openBoard(browser, board, 'はなこ');

  // 元の黒板に 1 本描いておく
  await a.mouse.move(400, 300);
  await a.mouse.down();
  await a.mouse.move(460, 300);
  await a.mouse.up();
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '1');

  // スイッチャーから名前指定で別の黒板へ移動する
  await a.getByRole('button', { name: /いまの黒板/ }).click();
  await a.getByRole('textbox', { name: '黒板の名前' }).fill(other);
  await a.getByRole('button', { name: 'いく' }).click();
  await expect(a).toHaveURL(`/b/${other}`);
  // フルページ遷移のため再入室を長めに待つ (外部フォントが遅い環境では描画開始が遅れる)
  await expect(a.locator('.presence-badge')).toHaveText(/1 人/, { timeout: 15_000 });

  // 別の黒板は空 = 盤面が独立している
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '0');

  // 訪問履歴に元の黒板が残り、リンクで戻れる (ストロークも残っている)
  await a.getByRole('button', { name: /いまの黒板/ }).click();
  await a
    .getByRole('list', { name: 'さいきん行った黒板' })
    .getByRole('link', { name: board })
    .click();
  await expect(a).toHaveURL(`/b/${board}`);
  await expect(a.locator('.presence-badge')).toHaveText(/1 人/, { timeout: 15_000 });
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '1');
});
