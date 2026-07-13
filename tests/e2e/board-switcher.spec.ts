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
  await a.getByRole('button', { name: 'ひらく' }).click();
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

test('「つくる」は同名の黒板が実在するとエラーになり、未使用の名前なら作成できる', async ({
  browser,
}) => {
  const board = uniqueBoard('e2e-named');
  const a = await openBoard(browser, board, 'はなこ'); // この時点で board は使用済みになる

  await a.getByRole('button', { name: /いまの黒板/ }).click();
  const input = a.getByRole('textbox', { name: '黒板の名前' });

  // 使用済みの名前 (いま開いている黒板) はエラーで遷移しない
  await input.fill(board);
  await a.getByRole('button', { name: 'つくる', exact: true }).click();
  await expect(a.getByRole('alert')).toHaveText('その名前はもう使われています');
  await expect(a).toHaveURL(`/b/${board}`);

  // 未使用の名前なら作成されて遷移する
  await input.fill(`${board}-atarashii`);
  await a.getByRole('button', { name: 'つくる', exact: true }).click();
  await expect(a).toHaveURL(`/b/${board}-atarashii`, { timeout: 15_000 });
  await expect(a.locator('.presence-badge')).toHaveText(/1 人/, { timeout: 15_000 });
});


test('黒板を削除すると開いている人に削除バナーが出て、盤面も空に戻る', async ({ browser }) => {
  const target = uniqueBoard('e2e-delete');
  // A が削除対象の黒板に落書きしておく
  const a = await openBoard(browser, target, 'はなこ');
  await a.mouse.move(400, 300);
  await a.mouse.down();
  await a.mouse.move(460, 300);
  await a.mouse.up();
  await expect(strokesOn(a)).toHaveAttribute('data-strokes', '1');

  // B は別の黒板から、リストの削除ボタンを 2 度押しで実行する
  const b = await openBoard(browser, `${target}-ops`, 'たろう', { color: 'blue' });
  await b.getByRole('button', { name: /いまの黒板/ }).click();
  await b.getByRole('textbox', { name: '黒板の名前' }).fill(target);
  await b.getByRole('button', { name: 'ひらく' }).click();
  await expect(b).toHaveURL(`/b/${target}`, { timeout: 15_000 });
  await expect(b.locator('.presence-badge')).toHaveText(/2 人/, { timeout: 15_000 });
  await b.getByRole('button', { name: /いまの黒板/ }).click();
  await b.getByRole('textbox', { name: '黒板の名前' }).fill(`${target}-ops`);
  await b.getByRole('button', { name: 'ひらく' }).click();
  await expect(b.locator('.presence-badge')).toHaveText(/1 人/, { timeout: 15_000 });

  await b.getByRole('button', { name: /いまの黒板/ }).click();
  const delBtn = b.getByRole('button', { name: `黒板「${target}」を削除` });
  await delBtn.click();
  await b.getByRole('button', { name: /もういちど押すと黒板/ }).click();
  // 削除された黒板はリストから消える
  await expect(b.getByRole('link', { name: target })).toHaveCount(0);

  // 開いていた A には削除バナーが出て、再接続しない
  await expect(a.locator('.banner')).toHaveText(/この黒板は削除されました/);
});
