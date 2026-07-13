// KST: shape, warm-up, constant-price invariant, hand-computed reference.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcKST } = require('../../src/chart/indicators/calc/kst.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcKST', () => {
    it('empty candles → empty {kst,signal}', () => {
        assert.deepStrictEqual(calcKST([]), { kst: [], signal: [] });
    });

    it('not enough samples → all null on both series', () => {
        // With defaults, ROC4 needs 31 samples, so 10 closes is way too few.
        const out = calcKST(makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
        assert.strictEqual(out.kst.length, 10);
        assert.strictEqual(out.signal.length, 10);
        for (const p of out.kst) assert.strictEqual(p.value, null);
        for (const p of out.signal) assert.strictEqual(p.value, null);
    });

    it('constant input → ROCs are 0 → KST is 0 → signal is 0 (once formed)', () => {
        // Need enough samples for at least one signal output:
        //   first KST at idx 44 (defaults), signal needs 9 more → idx 52.
        const closes = new Array(70).fill(100);
        const out = calcKST(makeCandles(closes));
        // After full warm-up everything is 0
        assert.strictEqual(out.kst[out.kst.length - 1].value, 0);
        assert.strictEqual(out.signal[out.signal.length - 1].value, 0);
    });

    it('first KST output lands at the right index (small params)', () => {
        // Use trivially small params so we can predict where KST forms.
        // ROC needs (L+1) samples → first non-null at index L.
        // SMA(ROC, k) needs k formed ROC samples → first non-null at index L + k - 1.
        // For ROC1Len=2 / SMA1Len=2 → idx 3; max across the four = 3.
        const params = {
            roc1Length: 2, roc2Length: 2, roc3Length: 2, roc4Length: 2,
            sma1Length: 2, sma2Length: 2, sma3Length: 2, sma4Length: 2,
            signalLength: 2,
        };
        const out = calcKST(makeCandles([1, 2, 3, 4, 5, 6, 7, 8]), params);
        assert.strictEqual(out.kst[0].value, null);
        assert.strictEqual(out.kst[1].value, null);
        assert.strictEqual(out.kst[2].value, null);
        assert.notStrictEqual(out.kst[3].value, null);
    });

    it('two series have candles.length entries each', () => {
        const candles = makeCandles(new Array(60).fill(0).map((_, i) => 100 + Math.sin(i / 3)));
        const out = calcKST(candles);
        assert.strictEqual(out.kst.length, candles.length);
        assert.strictEqual(out.signal.length, candles.length);
    });

    it('hand-computed small case (rocLen=1, smaLen=1)', () => {
        // rocLen=1, smaLen=1 → ROC[i] = (x[i] - x[i-1])/x[i-1]*100, SMA=ROC
        // So SMA1=SMA2=SMA3=SMA4 at every index ≥ 1 (all use rocLen=1).
        // KST[i] = (1 + 2 + 3 + 4) * ROC[i] = 10 * ROC[i]
        const params = {
            roc1Length: 1, roc2Length: 1, roc3Length: 1, roc4Length: 1,
            sma1Length: 1, sma2Length: 1, sma3Length: 1, sma4Length: 1,
            signalLength: 1,
        };
        // closes 100, 110, 121 → ROC = null, 10, 10
        const out = calcKST(makeCandles([100, 110, 121]), params);
        assert.strictEqual(out.kst[0].value, null);
        assert.ok(Math.abs(out.kst[1].value - 100) < 1e-9);  // 10 * 10
        assert.ok(Math.abs(out.kst[2].value - 100) < 1e-9);
        // Signal (smaLen=1) just echoes KST
        assert.strictEqual(out.signal[0].value, null);
        assert.ok(Math.abs(out.signal[1].value - 100) < 1e-9);
        assert.ok(Math.abs(out.signal[2].value - 100) < 1e-9);
    });

    it('time pass-through on both series', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const out = calcKST(candles, {
            roc1Length: 1, roc2Length: 1, roc3Length: 1, roc4Length: 1,
            sma1Length: 1, sma2Length: 1, sma3Length: 1, sma4Length: 1,
            signalLength: 1,
        });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out.kst[i].time, candles[i].time);
            assert.strictEqual(out.signal[i].time, candles[i].time);
        }
    });
});
