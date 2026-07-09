import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

/** wrangler dev のローカルストレージは実行間で残るため、ボード ID を毎回ユニークにする */
export function uniqueBoard(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

type OpenOptions = {
  color?: string;
  contextOptions?: BrowserContextOptions;
  /** true なら localStorage にプロフィールを入れず、名前入力ダイアログを通る */
  throughDialog?: boolean;
};

export async function openBoard(
  browser: Browser,
  board: string,
  name: string,
  { color = 'red', contextOptions, throughDialog = false }: OpenOptions = {},
): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ...contextOptions,
  });
  if (!throughDialog) {
    await context.addInitScript(
      ([n, c]) => {
        localStorage.setItem('kokuban:profile', JSON.stringify({ name: n, color: c }));
      },
      [name, color] as const,
    );
  }
  const page = await context.newPage();
  await page.goto(`/b/${board}`);
  if (throughDialog) {
    const dialog = page.getByRole('dialog', { name: 'なまえを かいてね' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill(name);
    await dialog.getByRole('button', { name: 'はいる' }).click();
  }
  // snapshot 受信 (自分が参加者に入る) まで待つ。接続確立前はツールが無効のため
  await expect(page.locator('.presence-badge')).toHaveText(/[1-9]\d* 人/);
  return page;
}

export function strokesOn(page: Page) {
  return page.locator('.board-canvas');
}
