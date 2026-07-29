// Lowest: trailing min of the candle CLOSE over `length` bars.
//
// Mirror of Highest. Lowest.cs reads `input.ToCandle().LowPrice`, but the class
// inherits [IndicatorIn(typeof(DecimalIndicatorValue))] from BaseIndicator, so
// the platform hands it a decimal that ToCandle() expands into a candle with
// open == high == low == close — the close on a candle feed.
//
// Pinned by StockSharp's own reference vectors: over Tests/Resources/ohlcv.txt
// the trailing min of the close reproduces Lowest.txt on all 1655 asserted
// rows, while the trailing min of the bar low misses 1458 of them.
//
// Not formed — emits nothing — before index length-1.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcLowest } = require('../../src/chart/indicators/calc/lowest.js');

// low is deliberately close - 1 (and high close + 2) so a min taken over the
// wrong column produces different numbers and cannot pass by accident.
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

    it('hand-computed length=3 reference over CLOSES', () => {
        // closes: 5,4,3,2,6,5,7
        //   i=2: min(5,4,3) = 3
        //   i=3: min(4,3,2) = 2
        //   i=4: min(3,2,6) = 2
        //   i=5: min(2,6,5) = 2
        //   i=6: min(6,5,7) = 5
        // Reading the lows instead would give [.., 2, 1, 1, 1, 4].
        const out = calcLowest(makeCloses([5, 4, 3, 2, 6, 5, 7]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, 3);
        assert.strictEqual(out[3].value, 2);
        assert.strictEqual(out[4].value, 2);
        assert.strictEqual(out[5].value, 2);
        assert.strictEqual(out[6].value, 5);
    });

    it('ignores a low that undercuts every close in the window', () => {
        // One bar wicks far below its close; the indicator must not see it.
        const candles = makeCloses([5, 4, 3]);
        candles[1].low = -999;
        const out = calcLowest(candles, { length: 3 });
        assert.strictEqual(out[2].value, 3);
    });

    it('time passes through unchanged', () => {
        const candles = makeCloses([1, 2, 3, 4]);
        const out = calcLowest(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });

    it('default length=5 when params omitted', () => {
        // closes 10,8,6,4,2 -> first 4 null, then the global min close = 2.
        const out = calcLowest(makeCloses([10, 8, 6, 4, 2]));
        for (let i = 0; i < 4; i++) assert.strictEqual(out[i].value, null);
        assert.strictEqual(out[4].value, 2);
    });
});
