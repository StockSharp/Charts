// VolumeProfile: cumulative price-bucketed volume histogram.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcVolumeProfile } = require('../../src/chart/indicators/calc/volumeprofile.js');

function mk(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`, open: r[0], high: r[0], low: r[0], close: r[0], volume: r[1],
    }));
}

describe('calcVolumeProfile', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcVolumeProfile([], { step: 1 }), []);
    });

    it('single bar → single bucket', () => {
        const out = calcVolumeProfile(mk([[10.4, 100]]), { step: 1 });
        assert.strictEqual(out.length, 1);
        assert.deepStrictEqual(out[0].buckets, [{ price: 10, volume: 100 }]);
        assert.strictEqual(out[0].value, 100);
    });

    it('cumulative buckets, step bucketing via floor', () => {
        // Step=1: 10.4→10, 10.7→10, 11.1→11
        const out = calcVolumeProfile(mk([
            [10.4, 100],
            [10.7, 50],
            [11.1, 30],
        ]), { step: 1 });
        assert.strictEqual(out.length, 3);
        // after bar 0: {10:100}
        assert.deepStrictEqual(out[0].buckets, [{ price: 10, volume: 100 }]);
        // after bar 1: {10:150}
        assert.deepStrictEqual(out[1].buckets, [{ price: 10, volume: 150 }]);
        // after bar 2: {10:150, 11:30} sorted ascending by price
        assert.deepStrictEqual(out[2].buckets, [
            { price: 10, volume: 150 },
            { price: 11, volume: 30 },
        ]);
        assert.strictEqual(out[2].value, 180);
    });

    it('step=0.5 buckets', () => {
        const out = calcVolumeProfile(mk([
            [10.4, 10],
            [10.6, 20],
        ]), { step: 0.5 });
        // 10.4 / 0.5 = 20.8 → floor 20 → 10.0
        // 10.6 / 0.5 = 21.2 → floor 21 → 10.5
        assert.deepStrictEqual(out[1].buckets, [
            { price: 10, volume: 10 },
            { price: 10.5, volume: 20 },
        ]);
    });
});
