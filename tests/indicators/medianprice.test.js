// MedianPrice: (high+low)/2 per bar, no warm-up, pure pass-through.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMedianPrice } = require('../../src/chart/indicators/calc/medianprice.js');

function makeCandles(rows) {
    return rows.map((r, i) => ({
        time: `2025-01-01T00:0${i}:00Z`,
        open: r.open ?? r.close ?? 0,
        high: r.high,
        low: r.low,
        close: r.close ?? r.high,
        volume: r.volume ?? 0,
    }));
}

describe('calcMedianPrice', () => {
    it('returns (high+low)/2 for every bar from the first one (no warm-up)', () => {
        const out = calcMedianPrice(makeCandles([
            { high: 10, low: 6 },
            { high: 12, low: 8 },
            { high: 9, low: 5 },
        ]));
        assert.strictEqual(out.length, 3);
        assert.strictEqual(out[0].value, 8);
        assert.strictEqual(out[1].value, 10);
        assert.strictEqual(out[2].value, 7);
    });

    it('preserves candle.time verbatim on every point', () => {
        const candles = makeCandles([
            { high: 1, low: 1 },
            { high: 2, low: 2 },
        ]);
        const out = calcMedianPrice(candles);
        assert.strictEqual(out[0].time, candles[0].time);
        assert.strictEqual(out[1].time, candles[1].time);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(calcMedianPrice([]), []);
    });

    it('non-finite high or low emits null for that bar', () => {
        const out = calcMedianPrice(makeCandles([
            { high: NaN, low: 1 },
            { high: 4, low: 2 },
            { high: 3, low: Infinity },
        ]));
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, 3);
        assert.strictEqual(out[2].value, null);
    });
});
