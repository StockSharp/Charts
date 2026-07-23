import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const performanceContract = JSON.parse(readFileSync(
    resolve(process.cwd(), 'benchmarks/orderflow-performance.json'),
    'utf8',
));

test('records the exact order-flow rendering and replace-last baseline', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-dpr1', 'Performance baseline is DPR-independent.');
    test.setTimeout(120_000);

    await page.goto('/tests/browser/fixtures/orderflow-performance.html');
    const measurements = await page.evaluate(() => (window as any).OrderFlowPerformanceFixture.run());

    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    const performanceMetrics = await cdp.send('Performance.getMetrics');
    const heapBytes = performanceMetrics.metrics.find(
        (metric: { name: string }) => metric.name === 'JSHeapUsedSize',
    )?.value;
    const baseline = {
        ...measurements,
        jsHeapUsedMiB: typeof heapBytes === 'number' ? heapBytes / 1024 / 1024 : null,
        browser: testInfo.project.name,
    };

    console.log('[orderflow-performance-baseline]', JSON.stringify(baseline));
    await testInfo.attach('orderflow-performance-baseline.json', {
        body: Buffer.from(JSON.stringify(baseline, null, 2)),
        contentType: 'application/json',
    });

    expect(baseline).toMatchObject(performanceContract.scenario);
    expect(Number(baseline.initializationMs)).toBeLessThan(performanceContract.budgets.initializationMs);
    expect(Number(baseline.frameP95Ms)).toBeLessThan(performanceContract.budgets.frameP95Ms);
    expect(Number(baseline.detailedFrameMs)).toBeLessThan(performanceContract.budgets.detailedFrameMs);
    expect(Number(baseline.replaceLastDispatchMs)).toBeLessThan(
        performanceContract.budgets.replaceLastDispatchMs,
    );
    expect(Number(baseline.realtimeUpdateMs)).toBeLessThan(performanceContract.budgets.realtimeUpdateMs);
    if (baseline.jsHeapUsedMiB !== null)
        expect(baseline.jsHeapUsedMiB).toBeLessThan(performanceContract.budgets.jsHeapUsedMiB);

    await page.evaluate(() => (window as any).OrderFlowPerformanceFixture.destroy());
});
