// Lowest: shape, warm-up, hand-computed reference vector. Operates on
// candle.close (Lowest.cs reads LowPrice but the canonical input is a
// DecimalIndicatorValue that synthesises LowPrice == ClosePrice).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcLowest } = require('../../src/chart/indicators/calc/lowest.js');

function makeCloses(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c + 1,
        high: c + 2,
        low: c - 1,
        close: c,
        volume: 0,
    }));
}

describe('calcLowest', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcLowest([], { length: 5 }), []);
    });

    it('length larger than candle count → every value null', () => {
        const out = calcLowest(makeCloses([3, 2, 1]), { length: 10 });
        assert.strictEqual(out.length, 3);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('warm-up: first (length-1) entries are null', () => {
        const out = calcLowest(makeCloses([5, 4, 3, 2, 1]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.notStrictEqual(out[2].value, null);
    });

    it('hand-computed length=3 reference (descending then mixed)', () => {
        // closes:           5, 4, 3, 2, 6, 5, 7
        // length=3 window covers indices i-2..i:
        //   i=2: min(5,4,3) = 3
        //   i=3: min(4,3,2) = 2
        //   i=4: min(3,2,6) = 2
        //   i=5: min(2,6,5) = 2
        //   i=6: min(6,5,7) = 5
        const out = calcLowest(makeCloses([5, 4, 3, 2, 6, 5, 7]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, 3);
        assert.strictEqual(out[3].value, 2);
        assert.strictEqual(out[4].value, 2);
        assert.strictEqual(out[5].value, 2);
        assert.strictEqual(out[6].value, 5);
    });

    it('time passes through unchanged', () => {
        const candles = makeCloses([1, 2, 3, 4]);
        const out = calcLowest(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });

    it('default length=5 when params omitted', () => {
        // 5 distinct closes → first 4 null, then global min.
        const out = calcLowest(makeCloses([10, 8, 6, 4, 2]));
        for (let i = 0; i < 4; i++) assert.strictEqual(out[i].value, null);
        assert.strictEqual(out[4].value, 2);
    });
});
