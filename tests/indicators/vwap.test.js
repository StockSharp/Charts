// VWAP: cumulative typical-price * volume / cumulative volume.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcVWAP } = require('../../src/chart/indicators/calc/vwap.js');

function mk(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`,
        open: r[0], high: r[0], low: r[1], close: r[2], volume: r[3],
    }));
}

describe('calcVWAP', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcVWAP([], {}), []);
    });

    it('cumulative formula on 3 bars', () => {
        // bar0 H=12 L=8 C=10 V=10 → tp=10, pv=100
        // bar1 H=14 L=10 C=12 V=20 → tp=12, pv=240
        // bar2 H=15 L=11 C=13 V=30 → tp=13, pv=390
        // VWAP: 100/10=10, (100+240)/(10+20)=340/30=11.333…, (100+240+390)/(10+20+30)=730/60=12.1666…
        const c = mk([
            [12, 8, 10, 10],
            [14, 10, 12, 20],
            [15, 11, 13, 30],
        ]);
        const r = calcVWAP(c, {});
        assert.ok(Math.abs(r[0].value - 10) < 1e-12);
        assert.ok(Math.abs(r[1].value - 340 / 30) < 1e-12);
        assert.ok(Math.abs(r[2].value - 730 / 60) < 1e-12);
    });

    it('zero cumulative volume → null', () => {
        const c = mk([[10, 10, 10, 0]]);
        const r = calcVWAP(c, {});
        assert.strictEqual(r[0].value, null);
    });

    it('output length equals input length', () => {
        const c = mk([[10, 10, 10, 1], [11, 11, 11, 1], [12, 12, 12, 1]]);
        assert.strictEqual(calcVWAP(c, {}).length, 3);
    });

    it('time passed through', () => {
        const c = mk([[1, 1, 1, 1], [2, 2, 2, 2]]);
        const r = calcVWAP(c, {});
        assert.strictEqual(r[0].time, c[0].time);
        assert.strictEqual(r[1].time, c[1].time);
    });
});
