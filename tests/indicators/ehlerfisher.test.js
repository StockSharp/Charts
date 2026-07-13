// Ehlers Fisher Transform: main + trigger lines.
// The .cs recurrence (0.66/0.67 blend + clip + atanh-shaped log) makes
// hand-computation impractical for any non-trivial input. We lean on
// (a) shape invariants and (b) a regression lock-in on a small known
// vector — see ehlerfisher.js header.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcEhlerFisher } = require('../../src/chart/indicators/calc/ehlerfisher.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCandles(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`, open: 0, high: r[0], low: r[1], close: (r[0] + r[1]) / 2, volume: 0,
    }));
}

describe('calcEhlerFisher', () => {
    it('empty candles → empty pair', () => {
        assert.deepStrictEqual(calcEhlerFisher([], { length: 10 }),
                               { main: [], trigger: [] });
    });

    it('length larger than candles → all-null on both lines', () => {
        const candles = makeCandles([[10, 8], [11, 9], [12, 10]]);
        const r = calcEhlerFisher(candles, { length: 10 });
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.main[i].value, null);
            assert.strictEqual(r.trigger[i].value, null);
        }
    });

    it('output length matches candles[] and time is passed through (both lines)', () => {
        const candles = makeCandles([
            [10, 8], [11, 9], [12, 10], [13, 11], [14, 12],
            [15, 13], [16, 14], [17, 15], [18, 16], [19, 17],
        ]);
        const r = calcEhlerFisher(candles, { length: 3 });
        assert.strictEqual(r.main.length, candles.length);
        assert.strictEqual(r.trigger.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.main[i].time, candles[i].time);
            assert.strictEqual(r.trigger[i].time, candles[i].time);
        }
    });

    it('trigger line lags main by exactly one bar (once both are formed)', () => {
        const rows = [];
        for (let i = 0; i < 20; i++) rows.push([10 + i + (i % 2), 8 + i - (i % 3)]);
        const candles = makeCandles(rows);
        const r = calcEhlerFisher(candles, { length: 5 });
        for (let i = 1; i < rows.length; i++) {
            const m = r.main[i - 1].value;
            const t = r.trigger[i].value;
            if (m === null || t === null) continue;
            approxEq(t, m, 1e-12);
        }
    });

    it('flat constant high/low series → main line saturates at clip bound', () => {
        // When (high - low) is constant and median sits at the middle of
        // the rolling [minLow, maxHigh] window, value0 = 0.5 * (0.5 - 0.5) = 0.
        // Recurrence then produces value = 0.67 * prevValue (stable, → 0).
        // fisher(0) = 0.5 * ln(1) = 0. So both lines = 0 (or null in warm-up).
        const rows = [];
        for (let i = 0; i < 15; i++) rows.push([10, 8]);
        const candles = makeCandles(rows);
        const r = calcEhlerFisher(candles, { length: 5 });
        for (let i = 5; i < 15; i++) {
            const v = r.main[i].value;
            if (v === null) continue;
            approxEq(v, 0, 1e-12);
        }
    });

    it('regression: locked-in numeric value on a small ramp', () => {
        // Captured from a clean run of the implementation; locks behaviour
        // so anyone editing the recurrence / clip / coefficient sees a
        // test failure rather than silently shifting the chart.
        const rows = [];
        for (let i = 0; i < 12; i++) rows.push([10 + i, 8 + i]);
        const candles = makeCandles(rows);
        const r = calcEhlerFisher(candles, { length: 4 });
        const main = r.main[11].value;
        const trig = r.trigger[11].value;
        assert.ok(typeof main === 'number' && Number.isFinite(main), 'main should be finite');
        assert.ok(typeof trig === 'number' && Number.isFinite(trig), 'trigger should be finite');
        approxEq(main, 0.30057424757777906, 1e-8);
        approxEq(trig, 0.2961855147377917, 1e-8);
    });
});
