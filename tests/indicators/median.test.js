// Median: trailing median of close over `length` bars.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMedian } = require('../../src/chart/indicators/calc/median.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcMedian', () => {
    it('length=3 over [1,3,2,5,4,6]: warm-up null then medians 2,3,4,5', () => {
        const out = calcMedian(makeCandles([1, 3, 2, 5, 4, 6]), { length: 3 });
        assert.strictEqual(out.length, 6);
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, 2);   // median of {1,3,2}
        assert.strictEqual(out[3].value, 3);   // median of {3,2,5}
        assert.strictEqual(out[4].value, 4);   // median of {2,5,4}
        assert.strictEqual(out[5].value, 5);   // median of {5,4,6}
    });

    it('even length uses average of the two middle elements', () => {
        // length=4, window [1,3,2,5] sorted -> [1,2,3,5], median = (2+3)/2 = 2.5
        const out = calcMedian(makeCandles([1, 3, 2, 5]), { length: 4 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        assert.strictEqual(out[3].value, 2.5);
    });

    it('default length=5 matches the .cs ctor', () => {
        // First non-null at index 4, median of {1,2,3,4,5} = 3.
        const out = calcMedian(makeCandles([1, 2, 3, 4, 5]));
        for (let i = 0; i < 4; i++) assert.strictEqual(out[i].value, null);
        assert.strictEqual(out[4].value, 3);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(calcMedian([], { length: 3 }), []);
    });

    it('length larger than candle count → every value null', () => {
        const out = calcMedian(makeCandles([1, 2, 3]), { length: 5 });
        assert.strictEqual(out.length, 3);
        for (const p of out) assert.strictEqual(p.value, null);
    });
});
