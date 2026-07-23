import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
});

test('chart labels use calendar/explicit timezone and one custom formatter contract', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const api = (window as any).SSChart;
        const host = document.createElement('div');
        document.body.appendChild(host);
        const calls: any[] = [];
        const calendar = new api.TradingCalendar({
            timeZone: 'America/New_York',
            sessions: [{
                id: 'regular',
                kind: api.TradingSessionKind.Regular,
                weekdays: [1, 2, 3, 4, 5],
                open: { hour: 9, minute: 30 },
                close: { hour: 16, minute: 0 },
            }],
        });
        const formatter = (time: number, context: any) => {
            calls.push({
                time,
                kind: context.kind,
                locale: context.locale,
                timeZone: context.timeZone,
                tickStep: context.tickStep,
                frozen: Object.isFrozen(context),
            });
            return `${context.kind}:${time}`;
        };
        const chart = api.createChart(host, {
            width: 700,
            height: 260,
            autoSize: false,
            timeScale: {
                calendar,
                locale: 'ru-RU',
                timeVisible: true,
                secondsVisible: true,
                formatter,
            },
        });
        const series = chart.addSeries(api.LineSeries);
        const first = Date.UTC(2026, 2, 9, 13, 30) / 1_000;
        series.setData([
            { time: first, value: 100 },
            { time: first + 3_600, value: 101 },
        ]);
        chart.timeScale().fitContent();
        chart.setCrosshairPosition({ time: first, price: 100, series });
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const calendarCalls = calls.splice(0);

        chart.applyOptions({
            timeScale: {
                locale: 'en-US',
                timeZone: 'Europe/Moscow',
            },
        });
        chart.setCrosshairPosition({ time: first, price: 100, series });
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const explicitCalls = calls.splice(0);
        chart.remove();
        host.remove();
        return { calendarCalls, explicitCalls };
    });

    expect(result.calendarCalls.some((call) => call.kind === 'tick')).toBe(true);
    expect(result.calendarCalls.some((call) => call.kind === 'crosshair')).toBe(true);
    expect(result.calendarCalls.every((call) => call.timeZone === 'America/New_York')).toBe(true);
    expect(result.calendarCalls.every((call) => call.locale === 'ru-RU')).toBe(true);
    expect(result.calendarCalls.every((call) => call.frozen)).toBe(true);
    expect(result.explicitCalls.some((call) => call.kind === 'tick')).toBe(true);
    expect(result.explicitCalls.some((call) => call.kind === 'crosshair')).toBe(true);
    expect(result.explicitCalls.every((call) => call.timeZone === 'Europe/Moscow')).toBe(true);
    expect(result.explicitCalls.every((call) => call.locale === 'en-US')).toBe(true);
});
