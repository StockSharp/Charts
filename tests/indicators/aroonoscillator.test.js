// Aroon Oscillator: single line = aroonUp - aroonDown.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcAroonOscillator } = require('../../src/chart/indicators/calc/aroonoscillator.js');
const { calcAroon } = require('../../src/chart/indicators/calc/aroon.js');

function makeCandles(hl) {
    return hl.map(([h, l], i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: (h + l) / 2,
        high: h,
        low: l,
        close: (h + l) / 2,
        volume: 0,
    }));
}

describe('calcAroonOscillator', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcAroonOscillator([], { length: 14 }), []);
    });

    it('length larger than candle count → every value null', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3]]);
        const r = calcAroonOscillator(candles, { length: 14 });
        assert.strictEqual(r.length, 3);
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
    });

    it('matches calcAroon up - down exactly', () => {
        const hl = [];
        for (let i = 0; i < 12; i++) hl.push([(i * 13) % 17 + 5, (i * 7) % 11]);
        const candles = makeCandles(hl);
        const r = calcAroonOscillator(candles, { length: 4 });
        const baseline = calcAroon(candles, { length: 4 });
        assert.strictEqual(r.length, hl.length);
        for (let i = 0; i < hl.length; i++) {
            if (baseline.up[i].value === null || baseline.down[i].value === null) {
                assert.strictEqual(r[i].value, null);
            } else {
                assert.strictEqual(r[i].value, baseline.up[i].value - baseline.down[i].value);
            }
        }
    });

    it('strictly rising trend: oscillator = up - down', () => {
        // length=4 window at i=4. Aroon.cs eviction-rescan quirks:
        // up: current bar is the highest → age=0 → up=100.
        // down: eviction-rescan sets minValueAge=1 (bufL idx) → down=75.
        // Oscillator = 100 - 75 = 25.
        const candles = makeCandles([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4]]);
        const r = calcAroonOscillator(candles, { length: 4 });
        assert.strictEqual(r[4].value, 25);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3], [5, 4], [6, 5]]);
        const r = calcAroonOscillator(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
