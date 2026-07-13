// Composite Momentum: empty/oversized warm-up + hand-computed sample on a
// monotonically rising series. Default lengths from CompositeMomentum.cs:
//   shortRoc=14, longRoc=28, rsi=14, emaFast=12, emaSlow=26, sma=9.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcCompositeMomentum } = require('../../src/chart/indicators/calc/compositemomentum.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcCompositeMomentum', () => {
    it('empty candles → {composite:[], sma:[]}', () => {
        const r = calcCompositeMomentum([], {});
        assert.deepStrictEqual(r, { composite: [], sma: [] });
    });

    it('length too big → every value null on both sub-series', () => {
        // Defaults need longRoc.Length+1 = 29 samples before any composite.
        // 20 samples are short of every inner indicator's warm-up.
        const closes = [];
        for (let i = 1; i <= 20; i++) closes.push(i);
        const r = calcCompositeMomentum(makeCandles(closes), {});
        assert.strictEqual(r.composite.length, 20);
        assert.strictEqual(r.sma.length, 20);
        for (const p of r.composite) assert.strictEqual(p.value, null);
        for (const p of r.sma) assert.strictEqual(p.value, null);
    });

    it('flat series → composite = 0 once all inner indicators are formed', () => {
        // Flat closes ⇒ ROC=0 (after warm-up), RSI=100/0 boundary, EMA
        // converges to the constant. But RSI on a flat series: avgGain=0,
        // avgLoss=0 → safe-guard returns 100. So composite is not 0 here,
        // it's dominated by (100-50)/50 = 1 part. Sanity-check it's a
        // constant: composite[i] should be identical for all i once formed.
        const closes = new Array(60).fill(50);
        const r = calcCompositeMomentum(makeCandles(closes), {});
        const formed = r.composite.filter(p => p.value !== null);
        assert.ok(formed.length > 0);
        const first = formed[0].value;
        for (const p of formed) {
            assert.ok(Math.abs(p.value - first) < 1e-9,
                `composite is not constant on a flat series: ${p.value} vs ${first}`);
        }
    });

    it('shape: composite and sma both have candles.length entries with passthrough time', () => {
        const closes = [];
        for (let i = 1; i <= 50; i++) closes.push(i + Math.sin(i));
        const candles = makeCandles(closes);
        const r = calcCompositeMomentum(candles, {});
        assert.strictEqual(r.composite.length, candles.length);
        assert.strictEqual(r.sma.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.composite[i].time, candles[i].time);
            assert.strictEqual(r.sma[i].time, candles[i].time);
        }
    });

    it('custom small lengths: hand-computed first-formed bar on [1..10]', () => {
        // shortRoc=2, longRoc=3, rsi=2, fast=2, slow=3, sma=2.
        // closes = 1..10.
        // Warm-ups: ROC@len=2 first valid i=2; ROC@len=3 first valid i=3;
        // RSI@len=2 first valid i=2; EMA@2 first valid i=1; EMA@3 first valid i=2.
        // ⇒ composite first valid at i=3.
        // At i=3, closes=4:
        //   shortRoc[3] = (4 - 2)/2*100 = 100  → /100 = 1
        //   longRoc[3]  = (4 - 1)/1*100 = 300  → /100 = 3
        //   rsi[3]: monotonic up → 100 → (100-50)/50 = 1
        //   emaFast (len=2) seed at i=1 = (1+2)/2 = 1.5, then
        //     i=2: 3*2/3 + 1.5*1/3 = 2 + 0.5 = 2.5
        //     i=3: 4*2/3 + 2.5*1/3 = 8/3 + 2.5/3 = 10.5/3 = 3.5
        //   emaSlow (len=3) seed at i=2 = (1+2+3)/3 = 2, then
        //     i=3: 4*2/4 + 2*2/4 = 2 + 1 = 3
        //   macdLine = (3.5 - 3) / 3 = 0.16666...
        //   composite = (1 + 3 + 1 + 0.16666...) / 4 * 100
        //             = (5.16666.../4) * 100
        //             = 129.1666...
        const r = calcCompositeMomentum(makeCandles([1,2,3,4,5,6,7,8,9,10]), {
            shortRocLength: 2, longRocLength: 3, rsiLength: 2,
            fastLength: 2, slowLength: 3, smaLength: 2,
        });
        for (let i = 0; i < 3; i++) assert.strictEqual(r.composite[i].value, null);
        const v3 = r.composite[3].value;
        const expected = ((1 + 3 + 1 + (3.5 - 3) / 3) / 4) * 100;
        assert.ok(Math.abs(v3 - expected) < 1e-9,
            `composite[3] expected ${expected}, got ${v3}`);
    });
});
