// SuperTrend — ATR-based trailing stop with direction.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcSuperTrend } = require('../../src/chart/indicators/calc/supertrend.js');

function makeOHLC(rows) {
    return rows.map((r, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: r[0], high: r[1], low: r[2], close: r[3], volume: 0,
    }));
}

describe('calcSuperTrend', () => {
    it('empty input → {value:[], direction:[]}', () => {
        assert.deepStrictEqual(calcSuperTrend([], { length: 3 }), { value: [], direction: [] });
    });

    it('warm-up nulls until index >= length-1 (ATR formed)', () => {
        // length=3 → csATR fills its Buffer at bar length-1=2 (TR[0]=high-low
        // seed at bar 0, count grows 1→3 by bar 2). SuperTrend emits from
        // there per the .cs `atrValue.IsFormed` gate.
        const rows = [];
        for (let i = 0; i < 6; i++) rows.push([i, i + 1, i - 1, i + 0.5]);
        const r = calcSuperTrend(makeOHLC(rows), { length: 3, multiplier: 2 });
        assert.strictEqual(r.value.length, rows.length);
        for (let i = 0; i < 2; i++) {
            assert.strictEqual(r.value[i].value, null);
            assert.strictEqual(r.direction[i].value, null);
        }
        // From index 2 we should see values.
        assert.ok(r.value[2].value !== null);
        assert.ok(r.direction[2].value === 1 || r.direction[2].value === -1);
    });

    it('rising trend → direction stays +1 once established', () => {
        const rows = [];
        for (let i = 0; i < 12; i++) rows.push([i, i + 2, i - 1, i + 1]); // strong up
        const r = calcSuperTrend(makeOHLC(rows), { length: 3, multiplier: 1 });
        // After warm-up, prices are rising; we expect direction = 1 on later bars.
        const lastDir = r.direction[r.direction.length - 1].value;
        assert.strictEqual(lastDir, 1);
    });

    it('preserves time on both series', () => {
        const rows = [];
        for (let i = 0; i < 8; i++) rows.push([i, i + 1, i - 1, i + 0.5]);
        const candles = makeOHLC(rows);
        const r = calcSuperTrend(candles, { length: 3, multiplier: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.value[i].time, candles[i].time);
            assert.strictEqual(r.direction[i].time, candles[i].time);
        }
    });
});
