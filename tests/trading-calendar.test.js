const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    TradingCalendar,
    TradingSessionKind,
} = require('../src/index.js');

const utc = (year, month, day, hour = 0, minute = 0) => (
    Date.UTC(year, month - 1, day, hour, minute) / 1_000
);

const regularRule = (overrides = {}) => ({
    id: 'regular',
    kind: TradingSessionKind.Regular,
    weekdays: [1, 2, 3, 4, 5],
    open: { hour: 9, minute: 30 },
    close: { hour: 16, minute: 0 },
    ...overrides,
});

describe('TradingCalendar', () => {
    it('materializes New York sessions across both DST transitions', () => {
        const calendar = new TradingCalendar({
            timeZone: 'America/New_York',
            sessions: [regularRule()],
        });

        const spring = calendar.sessionsInRange({
            from: utc(2026, 3, 6),
            to: utc(2026, 3, 11),
        });
        assert.deepEqual(spring.map((session) => [session.tradingDate, session.openTime, session.closeTime]), [
            ['2026-03-06', utc(2026, 3, 6, 14, 30), utc(2026, 3, 6, 21)],
            ['2026-03-09', utc(2026, 3, 9, 13, 30), utc(2026, 3, 9, 20)],
            ['2026-03-10', utc(2026, 3, 10, 13, 30), utc(2026, 3, 10, 20)],
        ]);

        const fall = calendar.sessionsInRange({
            from: utc(2026, 10, 30),
            to: utc(2026, 11, 4),
        });
        assert.deepEqual(fall.map((session) => [session.tradingDate, session.openTime]), [
            ['2026-10-30', utc(2026, 10, 30, 13, 30)],
            ['2026-11-02', utc(2026, 11, 2, 14, 30)],
            ['2026-11-03', utc(2026, 11, 3, 14, 30)],
        ]);
    });

    it('handles overnight sessions and keeps the local opening date stable', () => {
        const calendar = new TradingCalendar({
            timeZone: 'Europe/Moscow',
            sessions: [{
                id: 'overnight',
                kind: TradingSessionKind.Regular,
                weekdays: [1, 2, 3, 4, 5],
                open: { hour: 23, minute: 0 },
                close: { hour: 7, minute: 0 },
                closeDayOffset: 1,
            }],
        });
        const session = calendar.sessionAt(utc(2026, 7, 7, 1));
        assert.deepEqual(session, {
            id: '2026-07-06/overnight',
            ruleId: 'overnight',
            kind: 'regular',
            tradingDate: '2026-07-06',
            openTime: utc(2026, 7, 6, 20),
            closeTime: utc(2026, 7, 7, 4),
            isOverride: false,
        });
        assert.equal(calendar.isTradingTime(utc(2026, 7, 7, 5)), false);
        assert.equal(calendar.sessionAt(utc(2026, 7, 12, 1)), null);
    });

    it('applies holidays and replacement sessions with kind filtering', () => {
        const calendar = new TradingCalendar({
            timeZone: 'America/New_York',
            sessions: [
                regularRule({
                    id: 'pre',
                    kind: TradingSessionKind.PreMarket,
                    open: { hour: 4, minute: 0 },
                    close: { hour: 9, minute: 30 },
                }),
                regularRule(),
                regularRule({
                    id: 'post',
                    kind: TradingSessionKind.PostMarket,
                    open: { hour: 16, minute: 0 },
                    close: { hour: 20, minute: 0 },
                }),
            ],
            holidays: ['2026-12-25'],
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

        assert.equal(calendar.sessionsInRange({
            from: utc(2026, 12, 25, 5),
            to: utc(2026, 12, 26, 5),
        }).length, 0);
        const shortened = calendar.sessionsInRange({
            from: utc(2026, 11, 27, 5),
            to: utc(2026, 11, 28, 5),
        });
        assert.equal(shortened.length, 1);
        assert.equal(shortened[0].isOverride, true);
        assert.equal(shortened[0].closeTime, utc(2026, 11, 27, 18));

        const regularOnly = calendar.sessionsInRange({
            from: utc(2026, 11, 25),
            to: utc(2026, 11, 26),
        }, [TradingSessionKind.Regular]);
        assert.deepEqual(regularOnly.map((session) => session.kind), ['regular']);
    });

    it('uses the requested timezone rather than the process local timezone', () => {
        const calendar = new TradingCalendar({
            timeZone: 'Europe/Moscow',
            sessions: [regularRule({ open: { hour: 10, minute: 0 } })],
        });
        const winter = calendar.nextSession(utc(2026, 1, 12));
        const summer = calendar.nextSession(utc(2026, 7, 13));
        assert.equal(winter.openTime, utc(2026, 1, 12, 7));
        assert.equal(summer.openTime, utc(2026, 7, 13, 7));
    });

    it('supports a contiguous 24x7 schedule and adjacent lookup', () => {
        const calendar = new TradingCalendar({
            id: 'crypto',
            timeZone: 'UTC',
            sessions: [{
                id: 'day',
                kind: TradingSessionKind.Regular,
                weekdays: [1, 2, 3, 4, 5, 6, 7],
                open: { hour: 0, minute: 0 },
                close: { hour: 0, minute: 0 },
                closeDayOffset: 1,
            }],
        });
        const time = utc(2026, 7, 12, 14);
        assert.equal(calendar.sessionAt(time).tradingDate, '2026-07-12');
        assert.equal(calendar.nextSession(time).openTime, utc(2026, 7, 13));
        assert.equal(calendar.previousSession(time).closeTime, utc(2026, 7, 12));
        assert.equal(calendar.nextSession(time, []), null);
        assert.equal(calendar.previousSession(time, []), null);
    });

    it('owns an immutable validated schedule and rejects ambiguous configuration', () => {
        const input = {
            timeZone: 'UTC',
            sessions: [regularRule()],
            holidays: ['2026-12-25'],
        };
        const calendar = new TradingCalendar(input);
        input.sessions[0].open.hour = 1;
        input.holidays.push('2026-12-26');
        assert.equal(calendar.schedule().sessions[0].open.hour, 9);
        assert.deepEqual(calendar.schedule().holidays, ['2026-12-25']);
        assert.equal(Object.isFrozen(calendar.schedule().sessions[0].open), true);

        assert.throws(() => new TradingCalendar({
            timeZone: 'Not/AZone',
            sessions: [regularRule()],
        }), /invalid IANA timezone/);
        assert.throws(() => new TradingCalendar({
            timeZone: 'UTC',
            sessions: [regularRule(), regularRule({ id: 'overlap' })],
        }), /overlap/);
        assert.throws(() => new TradingCalendar({
            timeZone: 'UTC',
            sessions: [regularRule()],
            holidays: ['2026-02-30'],
        }), /valid calendar date/);

        const crossDateOverlap = new TradingCalendar({
            timeZone: 'UTC',
            sessions: [{
                id: 'overnight',
                kind: TradingSessionKind.Regular,
                weekdays: [1],
                open: { hour: 20, minute: 0 },
                close: { hour: 4, minute: 0 },
                closeDayOffset: 1,
            }],
            overrides: [{
                date: '2026-07-07',
                sessions: [{
                    id: 'early',
                    kind: TradingSessionKind.Regular,
                    open: { hour: 3, minute: 0 },
                    close: { hour: 10, minute: 0 },
                }],
            }],
        });
        assert.throws(() => crossDateOverlap.sessionsInRange({
            from: utc(2026, 7, 6),
            to: utc(2026, 7, 8),
        }), /overlap in UTC/);
    });
});
