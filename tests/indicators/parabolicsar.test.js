// Parabolic SAR — matches StockSharp's ParabolicSar.cs.
// The C# implementation has a candles.Count==3 seed branch that fires at
// bar 1 (its internal list double-adds the very first candle, so bar 1
// makes the list reach length 3 and triggers seed emission). Tests below
// reflect that bar 0 emits null while bar 1 already emits a numeric value.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcParabolicSAR } = require('../../src/chart/indicators/calc/parabolicsar.js');

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

describe('calcParabolicSAR', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcParabolicSAR([], {}), []);
    });

    it('single candle → one null point', () => {
        const r = calcParabolicSAR(makeCandles([[2, 1]]), {});
        assert.strictEqual(r.length, 1);
        assert.strictEqual(r[0].value, null);
    });

    it('bar 0 null; bar 1 emits the .cs seed value (xp + sign*(max-min)*af)', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3], [5, 4], [6, 5]]);
        const r = calcParabolicSAR(candles, { acceleration: 0.02, accelerationMax: 0.2, accelerationStep: 0.02 });
        assert.strictEqual(r[0].value, null);
        // bar 1: high[1]=3 > high[0]=2 → long. max=3, min=1. xp=3.
        // SAR = 3 + (-1) * (3 - 1) * 0.02 = 3 - 0.04 = 2.96.
        assert.ok(Math.abs(r[1].value - 2.96) < 1e-9, `got ${r[1].value}`);
        assert.notStrictEqual(r[2].value, null);
    });

    it('strictly rising trend: long, SAR stays below low', () => {
        // Highs increase monotonically, so trend stays long after seed.
        const candles = makeCandles([
            [2, 1],
            [3, 2],
            [4, 3],
            [5, 4],
            [6, 5],
            [7, 6],
        ]);
        const r = calcParabolicSAR(candles, { acceleration: 0.02, accelerationMax: 0.2, accelerationStep: 0.02 });
        // Once the trend confirms long, SAR must remain ≤ current bar's low.
        for (let i = 2; i < candles.length; i++) {
            assert.strictEqual(typeof r[i].value, 'number');
            assert.ok(r[i].value <= candles[i].low + 1e-9,
                `bar ${i}: SAR ${r[i].value} should be ≤ low ${candles[i].low}`);
        }
    });

    it('reversal: long flips to short on sharp drop; SAR rises above bar high', () => {
        const candles = makeCandles([
            [2, 1],
            [3, 2],
            [4, 3],
            [5, 4],
            [1, 0.5], // sharp reversal
            [0.8, 0.3],
        ]);
        const r = calcParabolicSAR(candles, { acceleration: 0.02, accelerationMax: 0.2, accelerationStep: 0.02 });
        assert.ok(r[4].value !== null);
        // After a flip to short, SAR sits at the prior long EP — well above
        // the current bar's high.
        assert.ok(r[4].value >= candles[4].high - 1e-9,
            `after reversal, SAR ${r[4].value} should be ≥ high ${candles[4].high}`);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3], [5, 4]]);
        const r = calcParabolicSAR(candles, {});
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
