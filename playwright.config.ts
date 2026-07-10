import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// クラウドセッション等のプリインストール Chromium。ピン留めバージョンのブラウザが
// 無い環境でも 'playwright install' なしで E2E を実行できるようフォールバックする
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const chromiumExecutable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8788',
    trace: 'retain-on-failure',
    // 環境変数 > プリインストール chromium > Playwright 管理ブラウザ の順で解決する
    ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // ログイン不要のローカルモードで本番相当 (Worker + DO + assets) を起動する
    command: 'pnpm build && pnpm exec wrangler dev --port 8788',
    url: 'http://127.0.0.1:8788',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
