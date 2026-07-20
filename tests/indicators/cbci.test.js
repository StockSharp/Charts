// Constance Brown Composite Index — composite of RSI ROC + RSI momentum.
// Hand-deriving the full cascade is brutal — we lean on shape invariants
// and a regression lock-in on a small known vector. See cbci.js header.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcConstanceBrownCompositeIndex } = require('../../src/chart/indicators/calc/cbci.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcConstanceBrownCompositeIndex', () => {
    it('empty candles → empty triple', () => {
        assert.deepStrictEqual(calcConstanceBrownCompositeIndex([], {}),
                               { composite: [], fastSma: [], slowSma: [] });
    });

    it('shape consistency: all three lines have same length and times', () => {
        const closes = [];
        for (let i = 0; i < 80; i++) closes.push(10 + i + (i % 3));
        const candles = makeCandles(closes);
        const r = calcConstanceBrownCompositeIndex(candles, {});
        assert.strictEqual(r.composite.length, candles.length);
        assert.strictEqual(r.fastSma.length, candles.length);
        assert.strictEqual(r.slowSma.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.composite[i].time, candles[i].time);
            assert.strictEqual(r.fastSma[i].time, candles[i].time);
            assert.strictEqual(r.slowSma[i].time, candles[i].time);
        }
    });

    it('candles fewer than warm-up → every value null on all lines', () => {
        // defaults: the composite is gated on all inner IsFormed, the slowest of
        // which is RSI(14) → first non-null at bar 14. 14 candles (indices 0..13)
        // is below that threshold.
        const closes = [];
        for (let i = 0; i < 14; i++) closes.push(10 + i);
        const r = calcConstanceBrownCompositeIndex(makeCandles(closes), {});
        for (let i = 0; i < 14; i++) {
            assert.strictEqual(r.composite[i].value, null);
            assert.strictEqual(r.fastSma[i].value, null);
            assert.strictEqual(r.slowSma[i].value, null);
        }
    });

    it('invalid params → all-null but correct length', () => {
        const r = calcConstanceBrownCompositeIndex(makeCandles([1, 2, 3, 4, 5]),
                                                   { rsiLength: 0 });
        assert.strictEqual(r.composite.length, 5);
        for (const p of r.composite) assert.strictEqual(p.value, null);
        for (const p of r.fastSma) assert.strictEqual(p.value, null);
        for (const p of r.slowSma) assert.strictEqual(p.value, null);
    });

    it('warm-up: composite lands at the combined all-formed bar', () => {
        // Small params: rsiLength=3, rocLength=2, shortRsiLength=2,
        // momentumLength=2. Since the RSIs feed the ROC/SMA their partial values
        // from bar 1, combinedBar = max(rsiLength, shortRsiLength, rocLength+1,
        // momentumLength) = max(3, 2, 3, 2) = 3 → first non-null at index 3.
        const closes = [];
        for (let i = 0; i < 15; i++) closes.push(10 + i + (i % 2));
        const r = calcConstanceBrownCompositeIndex(makeCandles(closes), {
            rsiLength: 3, rocLength: 2, shortRsiLength: 2, momentumLength: 2,
            fastSmaLength: 2, slowSmaLength: 3,
        });
        for (let i = 0; i < 3; i++) assert.strictEqual(r.composite[i].value, null);
        assert.notStrictEqual(r.composite[3].value, null);
    });

    it('regression: locked-in value on a small known vector', () => {
        // Capture the implementation's output on a specific input so any
        // accidental change to the cascade is caught.
        const closes = [];
        for (let i = 0; i < 30; i++) closes.push(10 + i + (i % 3) - (i % 5));
        const r = calcConstanceBrownCompositeIndex(makeCandles(closes), {
            rsiLength: 3, rocLength: 2, shortRsiLength: 2, momentumLength: 2,
            fastSmaLength: 3, slowSmaLength: 4,
        });
        const last = r.composite[29].value;
        assert.ok(typeof last === 'number' && Number.isFinite(last),
                  'last composite should be finite');
        // Lock-in: captured from a clean run.
        approxEq(last, 95.31383919102927, 1e-8);
    });
});
