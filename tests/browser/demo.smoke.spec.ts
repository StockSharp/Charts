import { expect, test } from '@playwright/test';

test('boots the real chart stack and adds overlay and pane indicators', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/demo/index.html');

    // The demo starts with the main chart plus the default RSI pane.
    await expect(page.locator('#chartContainer canvas[data-sschart-layer="overlay"]')).toHaveCount(1);
    await expect(page.locator('.chart-sub-pane')).toHaveCount(1);
    await expect(page.locator('.chart-sub-pane canvas')).toHaveCount(0);
    await expect(page.locator('.active-indicator-item')).toHaveCount(0);

    await page.locator('#themeBtn').click();
    await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'light');

    // Add Ichimoku to the main pane through the real catalog-driven dialog.
    await page.locator('#addIndicatorBtn').click();
    await expect(page.locator('#indicatorModal')).toHaveClass(/show/);
    await page.locator('.indicator-search-input').fill('Ichimoku');
    await page.locator('.indicator-list-item[data-id="Ichimoku"]').click();
    await page.locator('.indicator-add-btn').click();
    await expect(page.locator('.active-indicator-item')).toHaveCount(3);
    await page.locator('[data-close-modal]').click();

    // Add MACD into a new pane through the same UI path used by the terminal.
    await page.locator('#addPaneBtn').click();
    await page.locator('.indicator-search-input').fill('MACD');
    await page.locator('.indicator-list-item[data-id="MovingAverageConvergenceDivergence"]').click();
    await page.locator('.indicator-add-btn').click();
    await expect(page.locator('.chart-sub-pane')).toHaveCount(2);
    await expect(page.locator('#chartContainer > .sschart-root')).toHaveCount(1);
    await page.locator('[data-close-modal]').click();

    // Removing the only indicator from the newly-created pane must dispose the
    // native pane and collapse its header, while leaving the default RSI pane intact.
    const addedPane = page.locator('.chart-sub-pane').last();
    await addedPane.locator('.legend-remove-btn').click();
    await expect(page.locator('.chart-sub-pane')).toHaveCount(1);
    await expect(page.locator('#chartContainer canvas[data-sschart-layer="overlay"]')).toHaveCount(1);

    // Exercise one realtime update and stop it again so the test owns no timer.
    await page.locator('#realtimeBtn').click();
    await expect(page.locator('#realtimeBtn')).toHaveClass(/on/);
    await page.waitForTimeout(450);
    await page.locator('#realtimeBtn').click();
    await expect(page.locator('#realtimeBtn')).not.toHaveClass(/on/);

    expect(pageErrors).toEqual([]);
});
