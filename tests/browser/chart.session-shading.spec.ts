import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
});

test('SessionShading renders through the public primitive lifecycle', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const api = (window as any).SSChart;
        const host = document.createElement('div');
        document.body.appendChild(host);
        const chart = api.createChart(host, {
            width: 700,
            height: 260,
            autoSize: false,
            timeScale: { mode: api.TimeScaleMode.Continuous },
        });
        const base = host.querySelector('canvas[data-sschart-layer="base"]') as HTMLCanvasElement;
        const context = base.getContext('2d') as CanvasRenderingContext2D;
        const nativeFillRect = context.fillRect.bind(context);
        const fills: Array<{ color: string; x: number; y: number; width: number; height: number }> = [];
        context.fillRect = function (x, y, width, height) {
            if (this.fillStyle === '#ff00ff' || this.fillStyle === '#00ffff') {
                fills.push({ color: String(this.fillStyle), x, y, width, height });
            }
            return nativeFillRect(x, y, width, height);
        };

        const utc = (hour: number) => Date.UTC(2026, 6, 13, hour) / 1_000;
        const series = chart.addSeries(api.LineSeries);
        series.setData([8, 9, 12, 17, 18].map((hour, index) => ({
            time: utc(hour),
            value: 100 + index,
        })));
        chart.timeScale().fitContent();
        const calendar = new api.TradingCalendar({
            timeZone: 'UTC',
            sessions: [{
                id: 'regular',
                kind: api.TradingSessionKind.Regular,
                weekdays: [1, 2, 3, 4, 5],
                open: { hour: 9, minute: 0 },
                close: { hour: 17, minute: 0 },
            }],
        });
        const shading = new api.SessionShading({
            calendar,
            styles: {
                [api.TradingSessionKind.PreMarket]: { visible: false },
                [api.TradingSessionKind.Regular]: { color: '#ff00ff' },
                [api.TradingSessionKind.PostMarket]: { visible: false },
            },
        });
        chart.attachPrimitive(shading);
        const settle = () => new Promise<void>((resolve) => (
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        ));
        await settle();
        const firstFill = fills.find((fill) => fill.color === '#ff00ff') ?? null;
        const openX = chart.timeScale().timeToCoordinate(utc(9));
        const closeX = chart.timeScale().timeToCoordinate(utc(17));
        const visibleBefore = shading.visibleSessions().length;

        shading.applyOptions({ styles: { regular: { color: '#00ffff' } } });
        await settle();
        const patchedFill = fills.find((fill) => fill.color === '#00ffff') ?? null;
        chart.detachPrimitive(shading);
        await settle();
        const fillsAfterDetach = fills.length;
        chart.applyOptions({ grid: { vertLines: { visible: false } } });
        await settle();
        const detachedSessions = shading.visibleSessions().length;
        const fillsAfterRedraw = fills.length;
        chart.remove();
        host.remove();
        return {
            firstFill,
            patchedFill,
            openX,
            closeX,
            visibleBefore,
            detachedSessions,
            fillsAfterDetach,
            fillsAfterRedraw,
        };
    });

    expect(result.visibleBefore).toBe(1);
    expect(result.firstFill).not.toBeNull();
    expect(result.firstFill.x).toBeCloseTo(result.openX, 6);
    expect(result.firstFill.x + result.firstFill.width).toBeCloseTo(result.closeX, 6);
    expect(result.firstFill.height).toBeGreaterThan(0);
    expect(result.patchedFill).not.toBeNull();
    expect(result.detachedSessions).toBe(0);
    expect(result.fillsAfterRedraw).toBe(result.fillsAfterDetach);
});
