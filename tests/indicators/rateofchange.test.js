// Rate of Change — hand-computed expectations.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcRateOfChange } = require('../../src/chart/indicators/calc/rateofchange.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`);
}

describe('calcRateOfChange', () => {
    it('empty input → []', () => {
        assert.deepStrictEqual(calcRateOfChange([], { length: 3 }), []);
    });

    it('length=3: first 3 outputs null, then ((close[i]-close[i-3])/close[i-3])*100', () => {
        // closes 10,11,12,13,14,15 → at i=3: (13-10)/10*100 = 30; i=4: (14-11)/11*100; i=5: (15-12)/12*100=25
        const out = calcRateOfChange(makeCandles([10, 11, 12, 13, 14, 15]), { length: 3 });
        assert.strictEqual(out.length, 6);
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        approxEq(out[3].value, 30);
        approxEq(out[4].value, (14 - 11) / 11 * 100);
        approxEq(out[5].value, 25);
    });

    it('length+1 closes produce ONE non-null', () => {
        const out = calcRateOfChange(makeCandles([10, 20, 30, 40, 50]), { length: 4 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        assert.strictEqual(out[3].value, null);
        approxEq(out[4].value, 400); // (50-10)/10*100
    });

    it('default length=12 — needs 13 candles', () => {
        const closes = [];
        for (let i = 0; i < 12; i++) closes.push(1);
        const out = calcRateOfChange(makeCandles(closes));
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('zero past value → null (avoid div-by-zero)', () => {
        const out = calcRateOfChange(makeCandles([0, 1, 2, 3]), { length: 2 });
        // at i=2: past=0 → null
        assert.strictEqual(out[2].value, null);
    });
});
