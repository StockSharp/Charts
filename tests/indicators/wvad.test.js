// WVAD: cumulative ((C-O)/(H-L))*V.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcWVAD } = require('../../src/chart/indicators/calc/wvad.js');

function mk(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`, open: r[0], high: r[1], low: r[2], close: r[3], volume: r[4],
    }));
}

describe('calcWVAD', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcWVAD([], {}), []);
    });

    it('hand-computed cumulative', () => {
        // bar0 O=5 H=10 L=4 C=8 V=100 → (8-5)/(10-4) * 100 = 3/6*100 = 50 → acc=50
        // bar1 O=8 H=12 L=6 C=9 V=200 → (9-8)/(12-6) * 200 = 1/6*200 = 33.333… → acc=83.333…
        // bar2 O=9 H=11 L=7 C=8 V=50  → (8-9)/(11-7) * 50  = -1/4*50 = -12.5 → acc=70.833…
        const out = calcWVAD(mk([
            [5, 10, 4, 8, 100],
            [8, 12, 6, 9, 200],
            [9, 11, 7, 8, 50],
        ]), {});
        assert.ok(Math.abs(out[0].value - 50) < 1e-9);
        assert.ok(Math.abs(out[1].value - (50 + 200 / 6)) < 1e-9);
        assert.ok(Math.abs(out[2].value - (50 + 200 / 6 - 12.5)) < 1e-9);
    });

    it('high==low bar contributes 0', () => {
        const out = calcWVAD(mk([
            [5, 5, 5, 5, 100],
            [5, 5, 5, 5, 100],
        ]), {});
        assert.strictEqual(out[0].value, 0);
        assert.strictEqual(out[1].value, 0);
    });

    it('output length equals input length', () => {
        const out = calcWVAD(mk([[5, 10, 4, 8, 1], [5, 10, 4, 8, 1]]), {});
        assert.strictEqual(out.length, 2);
    });
});
