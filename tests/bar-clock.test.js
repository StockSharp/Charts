const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    BarClockState,
    calculateBarCountdown,
    resolveTradingBarBounds,
    TradingCalendar,
    TradingSessionKind,
} = require('../src/index.js');

const utc = (year, month, day, hour = 0, minute = 0) => (
    Date.UTC(year, month - 1, day, hour, minute) / 1_000
);

function utcCalendar(extra = {}) {
    return new TradingCalendar({
        timeZone: 'UTC',
        sessions: [{
            id: 'regular',
            kind: TradingSessionKind.Regular,
            weekdays: [1, 2, 3, 4, 5],
            open: { hour: 9, minute: 0 },
            close: { hour: 17, minute: 0 },
        }],
        ...extra,
    });
}

describe('bar clock', () => {
    it('builds deterministic pending/open/closed snapshots without a calendar', () => {
        const bounds = resolveTradingBarBounds(100, '5m');
        assert.deepEqual(bounds, {
            resolution: '5m',
            intervalSeconds: 300,
            openTime: 100,
            closeTime: 400,
            durationSeconds: 300,
            session: null,
        });
        assert.equal(Object.isFrozen(bounds), true);

        const pending = calculateBarCountdown(100, '5m', 50);
        assert.equal(pending.state, BarClockState.Pending);
        assert.equal(pending.untilOpenSeconds, 50);
        assert.equal(pending.remainingSeconds, 350);
        assert.equal(pending.progress, 0);

        const open = calculateBarCountdown(100, '5m', 250);
        assert.equal(open.state, BarClockState.Open);
        assert.equal(open.elapsedSeconds, 150);
        assert.equal(open.remainingSeconds, 150);
        assert.equal(open.progress, 0.5);

        const closed = calculateBarCountdown(100, '5m', 500);
        assert.equal(closed.state, BarClockState.Closed);
        assert.equal(closed.elapsedSeconds, 300);
        assert.equal(closed.remainingSeconds, 0);
        assert.equal(closed.progress, 1);
        assert.equal(Object.isFrozen(closed), true);
    });

    it('truncates intraday and overnight bars at the exact session close', () => {
        const earlyClose = new TradingCalendar({
            timeZone: 'America/New_York',
            sessions: [{
                id: 'regular',
                kind: TradingSessionKind.Regular,
                weekdays: [1, 2, 3, 4, 5],
                open: { hour: 9, minute: 30 },
                close: { hour: 16, minute: 0 },
            }],
            overrides: [{
                date: '2026-11-27',
                sessions: [{
                    id: 'regular',
                    kind: TradingSessionKind.Regular,
                    open: { hour: 9, minute: 30 },
                    close: { hour: 13, minute: 0 },
                }],
            }],
        });
        const shortened = resolveTradingBarBounds(
            utc(2026, 11, 27, 17, 30),
            '1h',
            { calendar: earlyClose },
        );
        assert.equal(shortened.closeTime, utc(2026, 11, 27, 18));
        assert.equal(shortened.durationSeconds, 1_800);
        assert.equal(shortened.session.isOverride, true);

        const overnight = new TradingCalendar({
            timeZone: 'Europe/Moscow',
            sessions: [{
                id: 'overnight',
                kind: TradingSessionKind.Regular,
                weekdays: [1],
                open: { hour: 23, minute: 0 },
                close: { hour: 7, minute: 0 },
                closeDayOffset: 1,
            }],
        });
        const overnightBar = resolveTradingBarBounds(
            utc(2026, 7, 7, 2),
            '4h',
            { calendar: overnight },
        );
        assert.equal(overnightBar.closeTime, utc(2026, 7, 7, 4));
        assert.equal(overnightBar.durationSeconds, 7_200);
    });

    it('advances daily bars by trading dates and weekly bars to the last session of the ISO week', () => {
        const calendar = utcCalendar({ holidays: ['2026-07-14'] });
        const mondayOpen = utc(2026, 7, 13, 9);
        const twoDay = resolveTradingBarBounds(mondayOpen, '2D', { calendar });
        assert.equal(twoDay.closeTime, utc(2026, 7, 15, 17));
        assert.equal(twoDay.session.tradingDate, '2026-07-13');

        const week = resolveTradingBarBounds(mondayOpen, '1W', { calendar });
        assert.equal(week.closeTime, utc(2026, 7, 17, 17));
        assert.equal(resolveTradingBarBounds(utc(2026, 7, 18, 12), '1h', { calendar }), null);
    });

    it('uses regular sessions by default and validates calendar-specific options', () => {
        const calendar = new TradingCalendar({
            timeZone: 'UTC',
            sessions: [
                {
                    id: 'pre',
                    kind: TradingSessionKind.PreMarket,
                    weekdays: [1],
                    open: { hour: 4, minute: 0 },
                    close: { hour: 9, minute: 0 },
                },
                {
                    id: 'regular',
                    kind: TradingSessionKind.Regular,
                    weekdays: [1],
                    open: { hour: 9, minute: 0 },
                    close: { hour: 17, minute: 0 },
                },
            ],
        });
        const preOpen = utc(2026, 7, 13, 4);
        assert.equal(resolveTradingBarBounds(preOpen, '1h', { calendar }), null);
        assert.equal(resolveTradingBarBounds(preOpen, '1h', {
            calendar,
            sessionKinds: [TradingSessionKind.PreMarket],
        }).closeTime, utc(2026, 7, 13, 5));
        assert.throws(() => resolveTradingBarBounds(0, '1m', {
            sessionKinds: [TradingSessionKind.Regular],
        }), /require a calendar/);
        assert.throws(() => calculateBarCountdown(0, '1m', Number.NaN), /now must be finite/);
    });
});
