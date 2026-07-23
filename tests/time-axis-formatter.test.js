const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    TimeAxisFormatter,
    TimeScaleLabelKind,
} = require('../src/time/time-axis-formatter.js');

const utc = (year, month, day, hour = 0, minute = 0, second = 0) => (
    Date.UTC(year, month - 1, day, hour, minute, second) / 1_000
);

describe('TimeAxisFormatter', () => {
    it('formats one UTC instant in the explicitly requested exchange timezone', () => {
        const time = utc(2026, 3, 9, 13, 30, 45);
        const newYork = new TimeAxisFormatter({
            locale: 'en-US',
            timeZone: 'America/New_York',
            timeVisible: true,
            secondsVisible: true,
        });
        const moscow = new TimeAxisFormatter({
            locale: 'en-US',
            timeZone: 'Europe/Moscow',
            timeVisible: true,
            secondsVisible: true,
        });

        assert.match(newYork.formatCrosshair(time), /09:30:45/);
        assert.match(moscow.formatCrosshair(time), /16:30:45/);
        assert.equal(newYork.formatTick(time, 60), '09:30');
        assert.equal(moscow.formatTick(time, 60), '16:30');
    });

    it('changes locale without changing the underlying timestamp or timezone', () => {
        const time = utc(2026, 7, 13, 9);
        const english = new TimeAxisFormatter({ locale: 'en-US', timeZone: 'UTC' });
        const russian = new TimeAxisFormatter({ locale: 'ru-RU', timeZone: 'UTC' });
        assert.notEqual(english.formatCrosshair(time), russian.formatCrosshair(time));
        assert.equal(english.formatTick(time, 60), russian.formatTick(time, 60));
    });

    it('delegates both label kinds with an immutable resolved context', () => {
        const calls = [];
        const formatter = new TimeAxisFormatter({
            locale: 'en-US',
            timeZone: 'America/New_York',
            timeVisible: true,
            formatter(time, context) {
                calls.push({ time, context });
                return `${context.kind}:${time}`;
            },
        });
        assert.equal(formatter.formatTick(100, 300), 'tick:100');
        assert.equal(formatter.formatCrosshair(200), 'crosshair:200');
        assert.deepEqual(calls.map((call) => call.context.kind), [
            TimeScaleLabelKind.Tick,
            TimeScaleLabelKind.Crosshair,
        ]);
        assert.equal(calls[0].context.timeZone, 'America/New_York');
        assert.equal(calls[0].context.tickStep, 300);
        assert.equal(calls[1].context.tickStep, null);
        assert.equal(Object.isFrozen(calls[0].context), true);
    });

    it('uses deterministic defaults and rejects invalid Intl configuration', () => {
        const formatter = new TimeAxisFormatter();
        assert.equal(formatter.locale, 'en-GB');
        assert.equal(formatter.timeZone, 'UTC');
        assert.throws(() => new TimeAxisFormatter({ timeZone: 'Local/Browser' }), /invalid.*timezone/i);
        assert.throws(() => new TimeAxisFormatter({ locale: 'not_a_locale' }), /invalid.*locale/i);
    });
});
