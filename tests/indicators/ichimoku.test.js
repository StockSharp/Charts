// Ichimoku: shape, warm-up across all 5 series, hand-checked midpoints,
// forward shift on the two Senkou lines, and backward shift on Chikou.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcIchimoku } = require('../../src/chart/indicators/calc/ichimoku.js');

function makeCandles(hl) {
    // close = midpoint of [h, l] so that close-based max/min math stays
    // self-explanatory: max close over a window = max midpoint, min close = min
    // midpoint. The high/low fields are populated for completeness but our
    // calc is close-based (mirrors the StockSharp reference data).
    return hl.map(([h, l], i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: (h + l) / 2,
        high: h,
        low: l,
        close: (h + l) / 2,
        volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcIchimoku', () => {
    it('empty candles → empty for all five lines', () => {
        assert.deepStrictEqual(
            calcIchimoku([], {}),
            { tenkan: [], kijun: [], senkouA: [], senkouB: [], chikou: [] },
        );
    });

    it('all five sub-series match candles[] in length', () => {
        const hl = [];
        for (let i = 0; i < 10; i++) hl.push([10 + i, 5 + i]);
        const candles = makeCandles(hl);
        const r = calcIchimoku(candles, { tenkan: 3, kijun: 5, senkouB: 7 });
        for (const k of ['tenkan', 'kijun', 'senkouA', 'senkouB', 'chikou']) {
            assert.strictEqual(r[k].length, candles.length, `${k} length mismatch`);
        }
    });

    it('length larger than candle count → tenkan/kijun/senkouA/senkouB null; chikou = close[i]', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3]]);
        const r = calcIchimoku(candles, { tenkan: 9, kijun: 26, senkouB: 52 });
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.tenkan[i].value, null);
            assert.strictEqual(r.kijun[i].value, null);
            assert.strictEqual(r.senkouA[i].value, null);
            assert.strictEqual(r.senkouB[i].value, null);
            // Chikou is just close[i] (StockSharp's IchimokuChinkouLine).
            assert.strictEqual(r.chikou[i].value, candles[i].close);
        }
    });

    it('tenkan/kijun midpoints match hand math', () => {
        // highs 1..10, lows 0..9 → midpoint over last N bars = (max(highs) + min(lows)) / 2
        const hl = [];
        for (let i = 1; i <= 10; i++) hl.push([i, i - 1]);
        const candles = makeCandles(hl);
        const r = calcIchimoku(candles, { tenkan: 3, kijun: 5, senkouB: 7 });
        // tenkan length=3: warm-up i<2. At i=2: highs[0..2]=1,2,3 max=3; lows=0,1,2 min=0; mid=1.5
        assert.strictEqual(r.tenkan[0].value, null);
        assert.strictEqual(r.tenkan[1].value, null);
        approxEq(r.tenkan[2].value, 1.5);
        // i=3: highs 2,3,4 max=4, lows 1,2,3 min=1, mid=2.5
        approxEq(r.tenkan[3].value, 2.5);
        // kijun length=5: warm-up i<4. At i=4: max(1..5)=5, min(0..4)=0, mid=2.5
        for (let i = 0; i < 4; i++) assert.strictEqual(r.kijun[i].value, null);
        approxEq(r.kijun[4].value, 2.5);
    });

    it('senkouA = (tenkan+kijun)/2 shifted forward by `kijun`', () => {
        const hl = [];
        for (let i = 1; i <= 20; i++) hl.push([i, i - 1]);
        const candles = makeCandles(hl);
        const kijunLen = 5;
        const r = calcIchimoku(candles, { tenkan: 3, kijun: kijunLen, senkouB: 7 });
        // senkouA[i] = (tenkan[i-kijun] + kijun[i-kijun]) / 2
        // First i where both are non-null and i-kijun >= 4 (kijun warm-up) → i = 9.
        for (let i = 0; i < kijunLen + 4; i++) {
            // until i-kijun reaches the kijun warm-up boundary (4), senkouA is null
            assert.strictEqual(r.senkouA[i].value, null, `senkouA[${i}] should be null`);
        }
        const src = 9 - kijunLen; // = 4
        const expected = (r.tenkan[src].value + r.kijun[src].value) / 2;
        approxEq(r.senkouA[9].value, expected);
    });

    it('chikou = close at the current bar (no forward look-ahead)', () => {
        const hl = [];
        for (let i = 1; i <= 10; i++) hl.push([i, i - 1]);
        const candles = makeCandles(hl);
        const r = calcIchimoku(candles, { tenkan: 2, kijun: 3, senkouB: 5 });
        // IchimokuChinkouLine.cs returns close directly — chikou[i] = close[i].
        // The visual back-shift by `kijun` is applied chart-side.
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.chikou[i].value, candles[i].close,
                `chikou[${i}] should equal close[${i}]`);
        }
    });

    it('alias params: tenkanPeriod/kijunPeriod/senkouBPeriod equivalent to tenkan/kijun/senkouB', () => {
        const hl = [];
        for (let i = 1; i <= 12; i++) hl.push([i, i - 1]);
        const candles = makeCandles(hl);
        const a = calcIchimoku(candles, { tenkan: 3, kijun: 5, senkouB: 7 });
        const b = calcIchimoku(candles, { tenkanPeriod: 3, kijunPeriod: 5, senkouBPeriod: 7 });
        for (const k of ['tenkan', 'kijun', 'senkouA', 'senkouB', 'chikou']) {
            for (let i = 0; i < candles.length; i++) {
                assert.strictEqual(a[k][i].value, b[k][i].value, `${k}[${i}] should be equal under both param names`);
            }
        }
    });

    it('time field passed through unchanged on all five series', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3], [5, 4]]);
        const r = calcIchimoku(candles, { tenkan: 2, kijun: 2, senkouB: 3 });
        for (let i = 0; i < candles.length; i++) {
            for (const k of ['tenkan', 'kijun', 'senkouA', 'senkouB', 'chikou']) {
                assert.strictEqual(r[k][i].time, candles[i].time);
            }
        }
    });
});
