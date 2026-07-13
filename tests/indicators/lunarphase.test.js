// LunarPhase: phase pinned at known NASA-calendar dates, range invariants.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const mod = require('../../src/chart/indicators/calc/lunarphase.js');
const { calcLunarPhase, _lunarPhaseFromMs } = mod;

function makeCandlesAtTimes(times) {
    return times.map((t) => ({
        time: t,
        open: 1, high: 1, low: 1, close: 1, volume: 0,
    }));
}

describe('calcLunarPhase', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcLunarPhase([]), []);
    });

    it('every emitted value is integer in [0..7]', () => {
        const candles = [];
        // sample 60 candles spaced at ~3.7 day intervals → spans 2+ lunar months
        for (let i = 0; i < 60; i++) {
            const t = new Date(Date.UTC(2024, 0, 1) + i * 86400000 * 3.7).toISOString();
            candles.push({ time: t, open: 1, high: 1, low: 1, close: 1, volume: 0 });
        }
        const out = calcLunarPhase(candles);
        for (const p of out) {
            assert.ok(Number.isInteger(p.value), `non-integer phase: ${p.value}`);
            assert.ok(p.value >= 0 && p.value <= 7, `out of range: ${p.value}`);
        }
    });

    it('new moon Jan 11 2024 06:57 UTC → phase 0 or adjacent (7/1)', () => {
        // Mirrors Ecng.Tests.Common.TimeHelperTests.GetLunarPhaseTest tolerance.
        const ms = Date.UTC(2024, 0, 11, 6, 57, 0);
        const phase = _lunarPhaseFromMs(ms);
        assert.ok(phase === 0 || phase === 1 || phase === 7,
            `expected 0/1/7 near new moon, got ${phase}`);
    });

    it('full moon Jan 25 2024 17:54 UTC → phase 3, 4 or 5', () => {
        const ms = Date.UTC(2024, 0, 25, 17, 54, 0);
        const phase = _lunarPhaseFromMs(ms);
        assert.ok(phase >= 3 && phase <= 5,
            `expected 3..5 near full moon, got ${phase}`);
    });

    it('phases cycle: ~29.53 day shift returns same (or near-same) phase', () => {
        const a = _lunarPhaseFromMs(Date.UTC(2024, 5, 1, 0, 0, 0));
        // 29.53 days later → must be same phase because we used exactly the cycle length
        const b = _lunarPhaseFromMs(Date.UTC(2024, 5, 1, 0, 0, 0) + Math.round(29.53 * 86400000));
        assert.strictEqual(b, a);
    });

    it('time is passed through unchanged', () => {
        const times = ['2024-01-11T06:57:00Z', '2024-02-09T22:00:00Z', '2024-03-25T07:00:00Z'];
        const candles = makeCandlesAtTimes(times);
        const out = calcLunarPhase(candles);
        for (let i = 0; i < times.length; i++) {
            assert.strictEqual(out[i].time, times[i]);
        }
    });

    it('reference Jan 6 2000 12:00 UTC is at start of cycle → phase 0', () => {
        // Algorithm uses 2451549.5 as the new-moon reference. That Julian
        // date corresponds to Jan 6 2000 00:00 UTC (note: julianDate's .5
        // offset means JD 2451549.5 = Jan 6 2000 00:00 UTC, not 12:00).
        const ms = Date.UTC(2000, 0, 6, 0, 0, 0);
        const phase = _lunarPhaseFromMs(ms);
        assert.strictEqual(phase, 0);
    });
});
