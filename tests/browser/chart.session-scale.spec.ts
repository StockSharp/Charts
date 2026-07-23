import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
});

test('continuous, ordinal and session-aware modes use distinct time domains', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const api = (window as any).SSChart;
        const utc = (year: number, month: number, day: number, hour: number) => (
            Date.UTC(year, month - 1, day, hour) / 1_000
        );
        const times = {
            friday15: utc(2026, 7, 10, 15),
            friday16: utc(2026, 7, 10, 16),
            fridayClose: utc(2026, 7, 10, 17),
            mondayOpen: utc(2026, 7, 13, 9),
            monday11: utc(2026, 7, 13, 11),
            monday12: utc(2026, 7, 13, 12),
        };
        const bars = [
            times.friday15,
            times.friday16,
            times.mondayOpen,
            times.monday11,
            times.monday12,
        ].map((time, index) => ({ time, value: 100 + index }));
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

        const measure = async (timeScale: any, nextTimeScale?: any) => {
            const host = document.createElement('div');
            host.style.width = '700px';
            host.style.height = '260px';
            document.body.appendChild(host);
            const chart = api.createChart(host, {
                width: 700,
                height: 260,
                autoSize: false,
                timeScale,
            });
            const series = chart.addSeries(api.LineSeries);
            series.setData(bars);
            chart.timeScale().fitContent();
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            const coordinate = (time: number) => chart.timeScale().timeToCoordinate(time);
            const coordinates = {
                friday15: coordinate(times.friday15),
                friday16: coordinate(times.friday16),
                fridayClose: coordinate(times.fridayClose),
                mondayOpen: coordinate(times.mondayOpen),
                monday11: coordinate(times.monday11),
                monday12: coordinate(times.monday12),
            };
            const boundaryTime = chart.timeScale().coordinateToTime(coordinates.mondayOpen);
            let afterCoordinates: typeof coordinates | null = null;
            if (nextTimeScale !== undefined) {
                chart.applyOptions({ timeScale: nextTimeScale });
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                afterCoordinates = {
                    friday15: coordinate(times.friday15),
                    friday16: coordinate(times.friday16),
                    fridayClose: coordinate(times.fridayClose),
                    mondayOpen: coordinate(times.mondayOpen),
                    monday11: coordinate(times.monday11),
                    monday12: coordinate(times.monday12),
                };
            }
            chart.remove();
            host.remove();
            return { coordinates, boundaryTime, afterCoordinates };
        };

        const continuous = await measure({ mode: api.TimeScaleMode.Continuous });
        const ordinal = await measure({ mode: api.TimeScaleMode.Ordinal });
        const session = await measure({
            mode: api.TimeScaleMode.SessionAware,
            calendar,
            sessionKinds: [api.TradingSessionKind.Regular],
        });
        const legacyToggle = await measure({ ordinal: true }, { ordinal: false });

        const invalidHost = document.createElement('div');
        let invalidMessage = '';
        try {
            api.createChart(invalidHost, { timeScale: { mode: api.TimeScaleMode.SessionAware } });
        } catch (error) {
            invalidMessage = String(error);
        }
        return {
            continuous,
            ordinal,
            session,
            legacyToggle,
            invalidMessage,
            invalidChildren: invalidHost.childElementCount,
        };
    });

    const gaps = (value: any) => ({
        regular: value.coordinates.friday16 - value.coordinates.friday15,
        weekend: value.coordinates.mondayOpen - value.coordinates.friday16,
        missing: value.coordinates.monday11 - value.coordinates.mondayOpen,
    });
    const continuous = gaps(result.continuous);
    const ordinal = gaps(result.ordinal);
    const session = gaps(result.session);

    expect(continuous.weekend / continuous.regular).toBeGreaterThan(60);
    expect(ordinal.weekend / ordinal.regular).toBeCloseTo(1, 8);
    expect(ordinal.missing / ordinal.regular).toBeCloseTo(1, 8);
    expect(session.weekend / session.regular).toBeCloseTo(1, 8);
    expect(session.missing / session.regular).toBeCloseTo(2, 8);
    expect(result.session.coordinates.fridayClose).toBeCloseTo(result.session.coordinates.mondayOpen, 8);
    expect(result.session.boundaryTime).toBe(Date.UTC(2026, 6, 13, 9) / 1_000);
    expect(gaps(result.legacyToggle).missing / gaps(result.legacyToggle).regular).toBeCloseTo(1, 8);
    expect(
        gaps({ coordinates: result.legacyToggle.afterCoordinates }).weekend
        / gaps({ coordinates: result.legacyToggle.afterCoordinates }).regular,
    ).toBeGreaterThan(60);
    expect(result.invalidMessage).toContain('requires a trading calendar');
    expect(result.invalidChildren).toBe(0);
});
