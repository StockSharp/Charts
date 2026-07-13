// SMA indicator: hand-computed expectations against tiny series.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcSMA } = require('../../src/chart/indicators/calc/sma.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:0${i}:00Z`,
        open: c,
        high: c,
        low: c,
        close: c,
        volume: 0,
    }));
}

describe('calcSMA', () => {
    it('length=3 over closes [1..6] nulls warm-up, then [2,3,4,5]', () => {
        const out = calcSMA(makeCandles([1, 2, 3, 4, 5, 6]), { length: 3 });
        assert.strictEqual(out.length, 6);
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, 2);
        assert.strictEqual(out[3].value, 3);
        assert.strictEqual(out[4].value, 4);
        assert.strictEqual(out[5].value, 5);
    });

    it('preserves candle.time untouched (passed through verbatim)', () => {
        const candles = makeCandles([1, 2, 3, 4]);
        const out = calcSMA(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });

    it('length larger than candle count → every value null', () => {
        const out = calcSMA(makeCandles([1, 2, 3]), { length: 10 });
        assert.strictEqual(out.length, 3);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('empty candle array → empty result', () => {
        assert.deepStrictEqual(calcSMA([], { length: 5 }), []);
    });

    it('default length applies when params omitted', () => {
        // 14 closes → only the last point should be non-null with default length=14.
        const closes = [];
        for (let i = 1; i <= 14; i++) closes.push(i);
        const out = calcSMA(makeCandles(closes));
        for (let i = 0; i < 13; i++) assert.strictEqual(out[i].value, null);
        // SMA of 1..14 = 7.5
        assert.strictEqual(out[13].value, 7.5);
    });
});
