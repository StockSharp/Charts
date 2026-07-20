// Lowest: trailing min of the candle LOW over `length` bars (StockSharp
// Lowest.cs reads input.ToCandle().LowPrice). Not formed — emits nothing —
// before index length-1.

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

    it('hand-computed length=3 reference over LOWS (lows = close - 1)', () => {
        // closes: 5,4,3,2,6,5,7  ->  lows: 4,3,2,1,5,4,6
        //   i=2: min(4,3,2) = 2
        //   i=3: min(3,2,1) = 1
        //   i=4: min(2,1,5) = 1
        //   i=5: min(1,5,4) = 1
        //   i=6: min(5,4,6) = 4
        const out = calcLowest(makeCloses([5, 4, 3, 2, 6, 5, 7]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, 2);
        assert.strictEqual(out[3].value, 1);
        assert.strictEqual(out[4].value, 1);
        assert.strictEqual(out[5].value, 1);
        assert.strictEqual(out[6].value, 4);
    });

    it('time passes through unchanged', () => {
        const candles = makeCloses([1, 2, 3, 4]);
        const out = calcLowest(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });

    it('default length=5 when params omitted', () => {
        // closes 10,8,6,4,2 -> lows 9,7,5,3,1; first 4 null, then global min low = 1.
        const out = calcLowest(makeCloses([10, 8, 6, 4, 2]));
        for (let i = 0; i < 4; i++) assert.strictEqual(out[i].value, null);
        assert.strictEqual(out[4].value, 1);
    });
});
