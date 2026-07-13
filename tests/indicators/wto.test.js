// WaveTrend oscillator: dual-line oscillator over typical price.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcWaveTrend } = require('../../src/chart/indicators/calc/wto.js');

function mk(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`, open: r[0], high: r[0], low: r[1], close: r[2], volume: 1,
    }));
}

describe('calcWaveTrend', () => {
    it('empty candles → empty series', () => {
        assert.deepStrictEqual(calcWaveTrend([], {}), { wt1: [], wt2: [] });
    });

    it('output length matches input length for both series', () => {
        const rows = Array.from({ length: 30 }, (_, i) => [i + 2, i, i + 1]);
        const r = calcWaveTrend(mk(rows), { esaPeriod: 3, dPeriod: 3, averagePeriod: 2 });
        assert.strictEqual(r.wt1.length, 30);
        assert.strictEqual(r.wt2.length, 30);
    });

    it('warm-up: first esaPeriod + dPeriod - 2 entries null on wt1', () => {
        const rows = Array.from({ length: 20 }, (_, i) => [i + 2, i, i + 1]);
        const r = calcWaveTrend(mk(rows), { esaPeriod: 3, dPeriod: 3, averagePeriod: 2 });
        // esa formed at i=2; d formed at i=4 (need 3 esa samples to seed)
        for (let i = 0; i < 4; i++) {
            assert.strictEqual(r.wt1[i].value, null, `wt1[${i}]`);
        }
        assert.notStrictEqual(r.wt1[4].value, null);
    });

    it('time passed through', () => {
        const rows = Array.from({ length: 10 }, (_, i) => [i + 2, i, i + 1]);
        const c = mk(rows);
        const r = calcWaveTrend(c, { esaPeriod: 3, dPeriod: 3, averagePeriod: 2 });
        for (let i = 0; i < c.length; i++) assert.strictEqual(r.wt1[i].time, c[i].time);
    });
});
