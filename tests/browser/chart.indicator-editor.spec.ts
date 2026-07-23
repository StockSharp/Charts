import { expect, test } from '@playwright/test';

test('edits inputs, source, pane, scale and every output through the controller', async ({ page }) => {
    await page.goto('/demo/index.html');
    await page.waitForFunction(() => (
        (window as any)._indicatorController?.indicators().length >= 2
    ));

    await page.locator('#addIndicatorBtn').click();
    await expect(page.locator('.indicator-category-tab')).toHaveCount(11);
    await expect(page.locator('.indicator-category-tab')).toContainText([
        'All', 'Favorites', 'Trend', 'Momentum', 'Volatility', 'Volume', 'Price',
        'Support & Resistance', 'Market Strength', 'Cycle', 'Statistical',
    ]);
    await page.locator('.indicator-search-input').fill('ao');
    await expect(page.locator('.indicator-list-item')).toHaveCount(1);
    await expect(page.locator('.indicator-list-item')).toHaveAttribute(
        'data-id',
        'AwesomeOscillator',
    );
    await page.locator('.indicator-favorite-toggle').click();
    await page.locator('.indicator-category-tab[data-group="__favorites__"]').click();
    await expect(page.locator('.indicator-list-item')).toHaveCount(1);
    await page.locator('.indicator-category-tab[data-group="All"]').click();
    await page.locator('.indicator-search-input').fill('');
    const firstActive = page.locator('.active-indicator-item').first();
    await firstActive.locator('.active-indicator-edit').click();

    await expect(page.locator('.indicator-settings-title')).toContainText('Bollinger');
    await expect(page.locator('.indicator-source-select option[value="field:hlc3"]')).toHaveCount(1);
    const derivedSource = await page.locator(
        '.indicator-source-select option[value^="indicator:"]',
    ).first().getAttribute('value');
    expect(derivedSource).not.toBeNull();
    await page.locator('.indicator-source-select').selectOption(derivedSource!);

    await page.locator('[data-parameter-id="length"]').fill('21');
    const targetPane = await page.locator(
        '.indicator-target-select option:not([value="__main__"])',
    ).first().getAttribute('value');
    expect(targetPane).not.toBeNull();
    await page.locator('.indicator-target-select').selectOption(targetPane!);
    await page.locator('.indicator-scale-select').selectOption('left');

    const output = page.locator('.indicator-output-row').first();
    await expect(page.locator('.indicator-output-row')).toHaveCount(3);
    await output.locator('.indicator-output-color').fill('#123456');
    await output.locator('.indicator-output-width').fill('3');
    await output.locator('.indicator-output-line-style').selectOption('2');
    await output.locator('.indicator-output-precision').selectOption('4');
    await output.locator('.indicator-output-visible').uncheck();
    await page.locator('.indicator-save-btn').click();

    await expect(page.locator('.indicator-editor-error')).toBeHidden();
    const state = await page.evaluate(() => {
        const indicator = (window as any)._indicatorController.indicators()[0];
        return {
            parameters: indicator.parameters,
            source: indicator.source,
            paneId: indicator.paneId,
            priceScaleId: indicator.priceScaleId,
            output: indicator.outputs[0],
        };
    });
    expect(state.parameters.length).toBe(21);
    expect(state.source.kind).toBe('indicator-output');
    expect(state.paneId).toBe(targetPane);
    expect(state.priceScaleId).toBe('left');
    expect(state.output.style).toMatchObject({
        color: '#123456',
        lineWidth: 3,
        lineStyle: 2,
        precision: 4,
        visible: false,
    });

    await page.locator('.indicator-template-name').fill('Bands 21');
    await page.locator('.indicator-template-create-btn').click();
    await expect(page.locator('.indicator-template-select option')).toHaveCount(2);
    await page.locator('[data-parameter-id="length"]').fill('25');
    await page.locator('.indicator-save-btn').click();
    await page.locator('.indicator-template-select').selectOption({ label: 'Bands 21' });
    await page.locator('.indicator-template-apply-btn').click();
    await expect(page.locator('[data-parameter-id="length"]')).toHaveValue('21');
    await expect.poll(() => page.evaluate(() => (
        (window as any)._indicatorController.indicators()[0].parameters.length
    ))).toBe(21);
    await page.locator('.indicator-template-remove-btn').click();
    await expect(page.locator('.indicator-template-select option')).toHaveCount(1);
});
