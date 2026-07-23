import { expect, test } from '@playwright/test';

test('public bar clock uses the exchange session close', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    const result = await page.evaluate(() => {
        const api = (window as any).SSChart;
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
        const open = Date.UTC(2026, 2, 9, 19, 30) / 1_000;
        const now = Date.UTC(2026, 2, 9, 19, 45) / 1_000;
        const countdown = api.calculateBarCountdown(open, '1h', now, { calendar });
        return {
            state: countdown.state,
            closeTime: countdown.bounds.closeTime,
            durationSeconds: countdown.bounds.durationSeconds,
            remainingSeconds: countdown.remainingSeconds,
            frozen: Object.isFrozen(countdown) && Object.isFrozen(countdown.bounds),
        };
    });

    expect(result.state).toBe('open');
    expect(result.closeTime).toBe(Date.UTC(2026, 2, 9, 20) / 1_000);
    expect(result.durationSeconds).toBe(1_800);
    expect(result.remainingSeconds).toBe(900);
    expect(result.frozen).toBe(true);
});
