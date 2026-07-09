import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8788',
    trace: 'retain-on-failure',
    // サンドボックス等でプリインストール chromium を使う場合の逃げ道
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
      : {}),
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
