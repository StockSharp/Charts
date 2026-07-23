import { defineConfig } from '@playwright/test';

const port = 8791;

export default defineConfig({
    testDir: './tests/browser',
    outputDir: './test-results',
    snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{projectName}/{arg}{ext}',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
    projects: [
        { name: 'chromium-dpr1', use: { deviceScaleFactor: 1 } },
        { name: 'chromium-dpr2', use: { deviceScaleFactor: 2 } },
    ],
    expect: {
        timeout: 5_000,
        toHaveScreenshot: {
            animations: 'disabled',
            maxDiffPixelRatio: 0.002,
        },
    },
    use: {
        baseURL: 'http://127.0.0.1:' + port,
        browserName: 'chromium',
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        viewport: { width: 1_100, height: 720 },
        colorScheme: 'dark',
        locale: 'en-US',
        timezoneId: 'UTC',
        actionTimeout: 5_000,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'node serve.mjs',
        url: 'http://127.0.0.1:' + port + '/tests/browser/fixtures/chart.html',
        env: {
            HOST: '127.0.0.1',
            PORT: String(port),
        },
        reuseExistingServer: !process.env.CI,
        timeout: 20_000,
    },
});
