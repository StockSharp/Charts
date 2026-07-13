// TWAP: cumulative running average of (h+l+c)/3.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcTWAP } = require('../../src/chart/indicators/calc/twap.js');

function mk(h, l, c, i) {
    return { time: `t${i}`, open: (h+l)/2, high: h, low: l, close: c, volume: 1 };
}

describe('calcTWAP', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcTWAP([], {}), []);
    });

    it('first bar equals its own typical price', () => {
        const r = calcTWAP([mk(110, 90, 100, 0)], {});
        assert.strictEqual(r[0].value, 100);  // (110+90+100)/3
    });

    it('cumulative running average', () => {
        // tp0 = (12+8+10)/3 = 10
        // tp1 = (24+18+21)/3 = 21
        // tp2 = (30+24+27)/3 = 27
        // running means: 10, 15.5, 19.333...
        const r = calcTWAP([mk(12, 8, 10, 0), mk(24, 18, 21, 1), mk(30, 24, 27, 2)], {});
        assert.strictEqual(r[0].value, 10);
        assert.strictEqual(r[1].value, 15.5);
        assert.ok(Math.abs(r[2].value - 58 / 3) < 1e-9);
    });

    it('time field passed through', () => {
        const r = calcTWAP([mk(10, 5, 7, 0)], {});
        assert.strictEqual(r[0].time, 't0');
    });

    it('bad bar (NaN) → null, running mean unchanged', () => {
        const candles = [
            mk(12, 8, 10, 0),
            { time: 't1', open: 0, high: NaN, low: 0, close: 0, volume: 1 },
            mk(24, 18, 21, 2),
        ];
        const r = calcTWAP(candles, {});
        assert.strictEqual(r[0].value, 10);
        assert.strictEqual(r[1].value, null);
        // bar2 contributes; running mean = (10 + 21) / 2 = 15.5
        assert.strictEqual(r[2].value, 15.5);
    });
});
