import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/tests/browser/fixtures/orderflow.html');
    await page.evaluate(() => (window as any).OrderFlowFixture.create());
});

test.afterEach(async ({ page }) => {
    await page.evaluate(() => (window as any).OrderFlowFixture.destroy());
});

test('switches footprint detail by zoom while fixed exact profile remains visible', async ({ page }) => {
    const detailed = await page.evaluate(() => (window as any).OrderFlowFixture.paintDetailed());
    const far = await page.evaluate(() => (window as any).OrderFlowFixture.paintFar());

    expect(detailed.texts.filter((value: string) => value.includes('×')).length).toBeGreaterThan(0);
    expect(far.texts.filter((value: string) => value.includes('×'))).toHaveLength(0);
    const profileColors = new Set(detailed.fills.map((item: { color: string }) => item.color));
    expect(profileColors.has('#7b1fa2')).toBe(true);
    expect(profileColors.has('#fdd835')).toBe(true);
});

test('rolls back rejected exact-series data and option mutations', async ({ page }) => {
    const result = await page.evaluate(() => (window as any).OrderFlowFixture.rollbackProbe());

    expect(result.errors).toHaveLength(3);
    expect(result.errors.every((value: string) => value.length > 0)).toBe(true);
    expect(result.afterUpdateLength).toBe(result.beforeLength);
    expect(result.afterSetLength).toBe(result.beforeLength);
    expect(result.sameUpdateTail).toBe(true);
    expect(result.sameSetTail).toBe(true);
    expect(result.tickSize).toBe(0.25);
    expect(result.type).toBe('Footprint');
    expect(result.profileType).toBe('ExactVolumeProfile');
});
