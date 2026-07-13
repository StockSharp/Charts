// McGinley Dynamic indicator tests.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMcGinleyDynamic } = require('../../src/chart/indicators/calc/mcginley.js');

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

describe('calcMcGinleyDynamic', () => {
    it('length=3 over constant series yields constant after seed', () => {
        const out = calcMcGinleyDynamic(makeCandles([5, 5, 5, 5, 5]), { length: 3 });
        assert.strictEqual(out.length, 5);
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, 5); // SMA seed
        // When price==prev, ratio=1 ⇒ md = prev + 0 = prev.
        assert.strictEqual(out[3].value, 5);
        assert.strictEqual(out[4].value, 5);
    });

    it('matches the explicit formula on a small rising series', () => {
        const closes = [1, 2, 3, 4, 5];
        const length = 3;
        const out = calcMcGinleyDynamic(makeCandles(closes), { length });
        // Seed = (1+2+3)/3 = 2 at index 2.
        assert.strictEqual(out[2].value, 2);
        // i=3: price=4, prev=2 → md = 2 + (4-2) / (0.6*3*(4/2)^4) = 2 + 2 / (1.8 * 16) = 2 + 2/28.8
        const expected3 = 2 + 2 / (0.6 * 3 * Math.pow(4 / 2, 4));
        assert.ok(Math.abs(out[3].value - expected3) < 1e-12);
        // i=4: price=5, prev=expected3
        const expected4 = expected3 + (5 - expected3) / (0.6 * 3 * Math.pow(5 / expected3, 4));
        assert.ok(Math.abs(out[4].value - expected4) < 1e-12);
    });

    it('length larger than candle count → all null', () => {
        const out = calcMcGinleyDynamic(makeCandles([1, 2, 3]), { length: 10 });
        assert.strictEqual(out.length, 3);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('default length=14 with insufficient data → all null', () => {
        const out = calcMcGinleyDynamic(makeCandles([1, 2, 3, 4, 5]));
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(calcMcGinleyDynamic([], { length: 5 }), []);
    });

    it('preserves candle.time field', () => {
        const candles = makeCandles([1, 2, 3, 4]);
        const out = calcMcGinleyDynamic(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
