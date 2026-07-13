// Ease of Movement: SMA of (midpointMove * range / volume).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcEOM } = require('../../src/chart/indicators/calc/eom.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCandles(rows) {
    // rows: [high, low, volume]
    return rows.map((r, i) => ({
        time: `t${i}`, open: 0, high: r[0], low: r[1], close: 0, volume: r[2],
    }));
}

describe('calcEOM', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcEOM([], { length: 14 }), []);
    });

    it('length larger than candles → every value null', () => {
        const r = calcEOM(makeCandles([[10, 8, 100], [11, 9, 100]]), { length: 14 });
        assert.strictEqual(r.length, 2);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('hand-computed length=2 on a simple three-bar series', () => {
        // bars: [high, low, volume]
        const rows = [
            [10, 8, 100],   // bar 0: no raw (no prev)
            [12, 10, 200],  // bar 1: midMove = (12+10)/2 - (10+8)/2 = 11 - 9 = 2
                            //        range = 2, volume = 200
                            //        rawEMV = 2 * 2 / 200 = 0.02
            [14, 12, 300],  // bar 2: midMove = (14+12)/2 - (12+10)/2 = 13 - 11 = 2
                            //        range = 2, volume = 300
                            //        rawEMV = 2 * 2 / 300 = 0.01333...
        ];
        const r = calcEOM(makeCandles(rows), { length: 2 });
        // SMA(rawEMV, 2): null until both bars 1 and 2 have raw values.
        // First valid output at index 2: (0.02 + 0.01333...) / 2 = 0.01666...
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, (0.02 + (2 * 2 / 300)) / 2);
    });

    it('zero range bar contributes null to the SMA window → emits null until window clears', () => {
        const rows = [
            [10, 8, 100],   // bar 0: no raw
            [11, 11, 100],  // bar 1: range = 0 → raw = null
            [13, 11, 100],  // bar 2: midMove = 12 - 11 = 1, range = 2, vol = 100
                            //        raw = 1*2/100 = 0.02
        ];
        const r = calcEOM(makeCandles(rows), { length: 2 });
        // Window of 2 raw values needs both non-null. At i=2 raw[1]=null,
        // raw[2]=0.02 → SMA invalid → null. Per simpleMA semantics.
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        assert.strictEqual(r[2].value, null);
    });

    it('zero volume bar → raw is null and SMA reflects gap', () => {
        const rows = [
            [10, 8, 100],
            [12, 10, 0],     // volume == 0 → raw = null
            [14, 12, 200],
        ];
        const r = calcEOM(makeCandles(rows), { length: 2 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([
            [10, 8, 100], [11, 9, 200], [12, 10, 300], [13, 11, 400], [14, 12, 500],
        ]);
        const r = calcEOM(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) assert.strictEqual(r[i].time, candles[i].time);
    });

    it('constant midpoint progression with constant range/volume → EOM constant', () => {
        const rows = [];
        for (let i = 0; i < 10; i++) rows.push([10 + i, 8 + i, 100]); // midpoint advances by 1 each bar
        const candles = makeCandles(rows);
        const r = calcEOM(candles, { length: 3 });
        // raw[i>=1] = 1 * 2 / 100 = 0.02; SMA of constant = 0.02 once formed.
        for (let i = 3; i < 10; i++) approxEq(r[i].value, 0.02);
    });
});
