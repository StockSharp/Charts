// Acceleration / Deceleration: shape, warm-up, and verification against
// composed AwesomeOscillator + SMA.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcAcceleration } = require('../../src/chart/indicators/calc/acceleration.js');
const { calcAwesomeOscillator } = require('../../src/chart/indicators/calc/awesomeoscillator.js');

function makeCandles(hl) {
    return hl.map(([h, l], i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: (h + l) / 2,
        high: h,
        low: l,
        close: (h + l) / 2,
        volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcAcceleration', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcAcceleration([], {}), []);
    });

    it('not enough data for AO → every value null', () => {
        const hl = [];
        for (let i = 0; i < 5; i++) hl.push([10 + i, 5 + i]);
        const r = calcAcceleration(makeCandles(hl), { shortLength: 5, longLength: 34, smaLength: 5 });
        assert.strictEqual(r.length, 5);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('first non-null lands at longLength + smaLength - 2 (combined warm-up)', () => {
        // short=2, long=3, sma=2:
        // AO first non-null at long-1 = 2.
        // SMA(2) over AO non-nulls → second non-null AO available at index 3 → AC at index 3.
        const hl = [];
        for (let i = 1; i <= 10; i++) hl.push([i + 0.5, i - 0.5]); // median = i
        const r = calcAcceleration(makeCandles(hl), { shortLength: 2, longLength: 3, smaLength: 2 });
        // Indices 0, 1: AO null → AC null
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        // Index 2: AO non-null but SMA(2) of AO not yet → AC null
        assert.strictEqual(r[2].value, null);
        // Index 3: AC = AO[3] - SMA([AO[2], AO[3]], 2). On arithmetic medians AO is constant=0.5,
        // so AC = 0.5 - 0.5 = 0.
        assert.notStrictEqual(r[3].value, null);
        approxEq(r[3].value, 0);
    });

    it('matches AO − SMA(AO) computed independently', () => {
        const hl = [
            [1.5, 0.5], [2.5, 1.5], [3.5, 2.5], [4.5, 3.5],
            [5.5, 4.5], [6.5, 5.5], [7.5, 6.5], [8.5, 7.5],
            [7.5, 6.5], [6.5, 5.5], [5.5, 4.5], [4.5, 3.5],
        ];
        const candles = makeCandles(hl);
        const params = { shortLength: 2, longLength: 4, smaLength: 3 };
        const ac = calcAcceleration(candles, params);
        const ao = calcAwesomeOscillator(candles, params);

        // Compute SMA(3) over AO values manually.
        const aoVals = ao.map(p => p.value);
        for (let i = 0; i < candles.length; i++) {
            if (i < 2 + 3 - 1) continue; // wait for AO warm-up (long-1=3) AND SMA(3): need 3 AO non-nulls
            // earliest AO non-null at index 3 (long=4 → index 3), need 3 AO values → indices 3,4,5
            // so first AC at index 5.
            if (i < 5) {
                assert.strictEqual(ac[i].value, null, `expected null at ${i}`);
                continue;
            }
            const window = aoVals.slice(i - 2, i + 1);
            const sma = window.reduce((a, b) => a + b, 0) / 3;
            approxEq(ac[i].value, aoVals[i] - sma);
        }
    });

    it('time field passed through unchanged', () => {
        const hl = [];
        for (let i = 0; i < 8; i++) hl.push([10 + i, 5 + i]);
        const candles = makeCandles(hl);
        const r = calcAcceleration(candles, { shortLength: 2, longLength: 3, smaLength: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
