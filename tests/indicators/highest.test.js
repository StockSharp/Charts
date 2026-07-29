// Highest: trailing max of the candle CLOSE over `length` bars.
//
// Highest.cs reads `input.ToCandle().HighPrice`, which reads like the bar high
// but is not: Highest inherits [IndicatorIn(typeof(DecimalIndicatorValue))]
// from BaseIndicator and never overrides it, so the platform hands it a
// decimal. SingleIndicatorValue<decimal>.GetValue<ICandleMessage>() wraps that
// decimal into a candle whose open/high/low/close are all the same number, so
// .HighPrice gives the number straight back — the close on a candle feed.
//
// Pinned by StockSharp's own reference vectors: over Tests/Resources/ohlcv.txt
// the trailing max of the close reproduces Highest.txt on all 1655 asserted
// rows, while the trailing max of the bar high misses 1480 of them.
//
// LengthIndicator.CalcIsFormed() is Buffer.Count >= Length, so nothing is
// emitted before index length-1. The reference file does carry expanding
// values on the warm-up rows, but Check() returns early while !IsFormed and
// never asserts them.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcHighest } = require('../../src/chart/indicators/calc/highest.js');

// high is deliberately close + 0.5 (and low close - 0.5) so that a max taken
// over the wrong column produces different numbers and cannot pass by accident.
function makeCloses(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 0,
    }));
}

describe('calcHighest', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcHighest([], { length: 5 }), []);
    });

    it('length-too-big (length > candles.length) → never formed → all null', () => {
        const candles = makeCloses([1, 3, 2, 5, 4]);
        const r = calcHighest(candles, { length: 100 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('reference vector: length=3, sliding max of CLOSES', () => {
        const closes = [1, 3, 2, 5, 4, 1, 2];
        const candles = makeCloses(closes);
        const r = calcHighest(candles, { length: 3 });
        //   i=2: max(1,3,2) = 3
        //   i=3: max(3,2,5) = 5
        //   i=4: max(2,5,4) = 5
        //   i=5: max(5,4,1) = 5
        //   i=6: max(4,1,2) = 4
        // Reading the highs instead would give [.., 3.5, 5.5, 5.5, 5.5, 4.5].
        const expected = [null, null, 3, 5, 5, 5, 4];
        for (let i = 0; i < closes.length; i++) {
            assert.strictEqual(r[i].value, expected[i]);
        }
    });

    it('length=1 → output equals the bar CLOSE itself, not the high', () => {
        const closes = [10, 20, 5, 15];
        const candles = makeCloses(closes);
        const r = calcHighest(candles, { length: 1 });
        for (let i = 0; i < closes.length; i++) {
            assert.strictEqual(r[i].value, closes[i]);
        }
    });

    it('ignores a high that exceeds every close in the window', () => {
        // One bar spikes far above its close; the indicator must not see it.
        const candles = makeCloses([1, 2, 3]);
        candles[1].high = 999;
        const r = calcHighest(candles, { length: 3 });
        assert.strictEqual(r[2].value, 3);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCloses([1, 2, 3, 4]);
        const r = calcHighest(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });

    it('default length=5 when params omitted', () => {
        const candles = makeCloses([1, 9, 3, 7, 5]);
        const r = calcHighest(candles);
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null);
        assert.strictEqual(r[4].value, 9);
    });
});
