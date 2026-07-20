// NickRypockTrailingReverse tests. DecimalLengthIndicator: not formed (null)
// until `length` values are buffered; the state machine still advances during
// warm-up, only the output is gated.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcNickRypockTrailingReverse } = require('../../src/chart/indicators/calc/nrtr.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:0${i}:00Z`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcNickRypockTrailingReverse', () => {
    it('matches the explicit state-machine trace on length=2, multiple=100', () => {
        // length=2 → index 0 is warm-up (null); state still advances. Trace of the
        // reverse line (verified by hand against the .cs): out[1]=10.4, out[2]=11.37.
        const out = calcNickRypockTrailingReverse(
            makeCandles([10, 11, 12]),
            { length: 2, multiple: 100 }
        );
        assert.strictEqual(out.length, 3);
        assert.strictEqual(out[0].value, null); // warm-up (Buffer.Count 1 < Length 2)
        assert.ok(Math.abs(out[1].value - 10.4) < 1e-9);
        assert.ok(Math.abs(out[2].value - 11.37) < 1e-9);
    });

    it('clamps multiple ≤ 1 to 1 (per .cs setter)', () => {
        const out0 = calcNickRypockTrailingReverse(makeCandles([10, 10, 10]), { length: 2, multiple: 0 });
        const out1 = calcNickRypockTrailingReverse(makeCandles([10, 10, 10]), { length: 2, multiple: 1 });
        assert.deepStrictEqual(out0.map(p => p.value), out1.map(p => p.value));
    });

    it('warm-up (first length-1) null, then a finite reverse line', () => {
        const out = calcNickRypockTrailingReverse(makeCandles([1, 2, 3, 4, 5]), { length: 3, multiple: 50 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        for (let i = 2; i < out.length; i++) {
            assert.notStrictEqual(out[i].value, null);
            assert.ok(Number.isFinite(out[i].value));
        }
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(
            calcNickRypockTrailingReverse([], { length: 5, multiple: 100 }),
            []
        );
    });

    it('preserves candle.time', () => {
        const candles = makeCandles([1, 2, 3, 4]);
        const out = calcNickRypockTrailingReverse(candles, { length: 2, multiple: 100 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });

    it('default params (length=50, multiple=100) run without error', () => {
        const closes = [];
        for (let i = 0; i < 60; i++) closes.push(100 + Math.sin(i / 5) * 5);
        const out = calcNickRypockTrailingReverse(makeCandles(closes));
        assert.strictEqual(out.length, 60);
        // Warm-up (first 49) null; from index 49 the reverse line is finite.
        for (let i = 0; i < 49; i++) assert.strictEqual(out[i].value, null);
        for (let i = 49; i < 60; i++) assert.ok(Number.isFinite(out[i].value));
    });
});
