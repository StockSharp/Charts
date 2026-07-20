// Kase Peak Oscillator: two histograms derived from adjusted peak/valley
// buffers and a hardcoded ATR(10) baseline.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcKasePeakOscillator } = require('../../src/chart/indicators/calc/kpo.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function mk(h, l, c, i) {
    return { time: `t${i}`, open: (h + l) / 2, high: h, low: l, close: c, volume: 1 };
}

describe('calcKasePeakOscillator', () => {
    it('empty candles → empty short/long arrays', () => {
        assert.deepStrictEqual(calcKasePeakOscillator([], {}), { shortTerm: [], longTerm: [] });
    });

    it('warm-up: null until ATR(atrLength) is formed', () => {
        const candles = [];
        for (let i = 0; i < 5; i++) candles.push(mk(2 + i * 0.1, 1, 1.5, i));
        // shortPeriod/longPeriod=1 → the Part wrappers form immediately, so the
        // only warm-up is the ATR: csATR fills its Wilder buffer at bar
        // atrLength-1 (TR[0]=high-low seed, count grows 1→atrLength). Bars 0..2
        // null; first emitted bar is atrLength-1 = 3.
        const r = calcKasePeakOscillator(candles, { atrLength: 4, shortPeriod: 1, longPeriod: 1 });
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.shortTerm[i].value, null);
            assert.strictEqual(r.longTerm[i].value, null);
        }
        assert.notStrictEqual(r.shortTerm[3].value, null);
        assert.notStrictEqual(r.longTerm[3].value, null);
    });

    it('line gating: ShortTerm/LongTerm Part lengths delay each line', () => {
        // Defaults ShortPeriod=9, LongPeriod=18, ATR(10) → the Parts are fed from
        // bar atrLength-1 = 9, so ShortTerm forms at 9+9-1=17 and LongTerm at
        // 9+18-1=26. Lines are null before those bars.
        const candles = [];
        for (let i = 0; i < 30; i++) {
            const base = 100 + Math.sin(i / 4) * 10;
            candles.push(mk(base + 1, base - 1, base + Math.cos(i / 5), i));
        }
        const r = calcKasePeakOscillator(candles, {});
        assert.strictEqual(r.shortTerm[16].value, null);
        assert.notStrictEqual(r.shortTerm[17].value, null);
        assert.strictEqual(r.longTerm[25].value, null);
        assert.notStrictEqual(r.longTerm[26].value, null);
    });

    it('output shapes match input length; timestamps pass through', () => {
        const candles = [];
        for (let i = 0; i < 15; i++) candles.push(mk(2, 1, 1.5, i));
        const r = calcKasePeakOscillator(candles, { atrLength: 5 });
        assert.strictEqual(r.shortTerm.length, 15);
        assert.strictEqual(r.longTerm.length, 15);
        for (let i = 0; i < 15; i++) {
            assert.strictEqual(r.shortTerm[i].time, candles[i].time);
            assert.strictEqual(r.longTerm[i].time, candles[i].time);
        }
    });

    it('first emitted bar (i == atrLength-1): short == long (both buffers have 1 item, same value)', () => {
        const candles = [];
        for (let i = 0; i < 6; i++) candles.push(mk(2 + i, 1 + i, 1.5 + i, i));
        // Part lengths=1 so both lines emit from bar atrLength-1=3, where the
        // peak/valley buffers each hold one item → den1 == den2 and
        // minValley == valleyBuf[0], so short == long.
        const r = calcKasePeakOscillator(candles, { atrLength: 4, shortPeriod: 1, longPeriod: 1 });
        approxEq(r.shortTerm[3].value, r.longTerm[3].value);
    });

    it('values land in finite range and timestamps line up (no NaN once formed)', () => {
        const candles = [];
        for (let i = 0; i < 30; i++) {
            const base = 100 + Math.sin(i / 4) * 10;
            candles.push(mk(base + 1, base - 1, base + Math.cos(i / 5), i));
        }
        // Part lengths=1 so both lines emit from ATR-formed bar (9); check the
        // values are finite once emitted (no NaN/Infinity from the divisions).
        const r = calcKasePeakOscillator(candles, { atrLength: 10, shortPeriod: 1, longPeriod: 1 });
        for (let i = 10; i < 30; i++) {
            assert.ok(Number.isFinite(r.shortTerm[i].value));
            assert.ok(Number.isFinite(r.longTerm[i].value));
        }
    });

    it('flat bars after ATR forms → den1, den2 can be zero → outputs are 0 (not NaN)', () => {
        // Flat candles: high == low == close. TR will be 0 (or use prev close difference 0),
        // ATR = 0. Then peak adjustments collapse since cl == prevClose (no branch).
        const candles = [];
        for (let i = 0; i < 15; i++) candles.push(mk(5, 5, 5, i));
        const r = calcKasePeakOscillator(candles, { atrLength: 5 });
        for (let i = 5; i < 15; i++) {
            // peak == valley everywhere → den1 = 0, den2 = 0 → 0.
            approxEq(r.shortTerm[i].value, 0);
            approxEq(r.longTerm[i].value, 0);
        }
    });

    it('rising trend: short term oscillator stays > 50 most of the time', () => {
        // Build a strictly rising series. close near high → oscillator → 100.
        const candles = [];
        for (let i = 0; i < 20; i++) {
            const c = 10 + i;
            candles.push(mk(c + 0.5, c - 0.5, c + 0.4, i));
        }
        const r = calcKasePeakOscillator(candles, { atrLength: 5 });
        let aboveHalf = 0;
        let total = 0;
        for (let i = 6; i < 20; i++) {
            if (r.shortTerm[i].value !== null) {
                total++;
                if (r.shortTerm[i].value > 50) aboveHalf++;
            }
        }
        assert.ok(aboveHalf > total / 2, `short term should be > 50 most of the time on a rising trend (was ${aboveHalf}/${total})`);
    });
});
