// GMMA: 12 EMAs (6 short + 6 long), shape and warm-up sanity.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcGMMA, GMMA_SHORT_LENGTHS, GMMA_LONG_LENGTHS } =
    require('../../src/chart/indicators/calc/gmma.js');
const { calcEMA } = require('../../src/chart/indicators/calc/ema.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCloses(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcGMMA', () => {
    it('default lengths exactly match the .cs: [3,5,8,10,12,15] and [30,35,40,45,50,60]', () => {
        assert.deepStrictEqual(GMMA_SHORT_LENGTHS, [3, 5, 8, 10, 12, 15]);
        assert.deepStrictEqual(GMMA_LONG_LENGTHS, [30, 35, 40, 45, 50, 60]);
    });

    it('empty candles → 6 short + 6 long empty sub-arrays', () => {
        const r = calcGMMA([], {});
        assert.strictEqual(r.short.length, 6);
        assert.strictEqual(r.long.length, 6);
        for (const s of r.short) assert.deepStrictEqual(s, []);
        for (const s of r.long) assert.deepStrictEqual(s, []);
    });

    it('all 12 sub-series have length == candles.length', () => {
        const candles = makeCloses(Array.from({ length: 80 }, (_, i) => i + 1));
        const r = calcGMMA(candles, {});
        for (const s of r.short) assert.strictEqual(s.length, candles.length);
        for (const s of r.long) assert.strictEqual(s.length, candles.length);
    });

    it('first non-null appears at index (length - 1) for each sub-line (warm-up alignment)', () => {
        const candles = makeCloses(Array.from({ length: 80 }, (_, i) => i + 1));
        const r = calcGMMA(candles, {});
        for (let s = 0; s < GMMA_SHORT_LENGTHS.length; s++) {
            const L = GMMA_SHORT_LENGTHS[s];
            if (L - 2 >= 0) assert.strictEqual(r.short[s][L - 2].value, null);
            assert.notStrictEqual(r.short[s][L - 1].value, null);
        }
        for (let s = 0; s < GMMA_LONG_LENGTHS.length; s++) {
            const L = GMMA_LONG_LENGTHS[s];
            if (L - 2 >= 0) assert.strictEqual(r.long[s][L - 2].value, null);
            assert.notStrictEqual(r.long[s][L - 1].value, null);
        }
    });

    it('each sub-line is identical to a standalone calcEMA of the same length (spot-check)', () => {
        // Spot-check one short and one long sub-line against the underlying EMA.
        const candles = makeCloses(Array.from({ length: 70 }, (_, i) => Math.sin(i / 4) * 10 + 50));
        const r = calcGMMA(candles, {});
        const referenceShort = calcEMA(candles, { length: 8 });   // GMMA_SHORT_LENGTHS[2]
        const referenceLong = calcEMA(candles, { length: 50 });   // GMMA_LONG_LENGTHS[4]
        for (let i = 0; i < candles.length; i++) {
            if (referenceShort[i].value === null) {
                assert.strictEqual(r.short[2][i].value, null);
            } else {
                approxEq(r.short[2][i].value, referenceShort[i].value);
            }
            if (referenceLong[i].value === null) {
                assert.strictEqual(r.long[4][i].value, null);
            } else {
                approxEq(r.long[4][i].value, referenceLong[i].value);
            }
        }
    });
});
