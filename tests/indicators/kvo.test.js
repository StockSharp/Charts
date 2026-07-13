// KVO: shape, warm-up, signed-volume / EMA-diff invariants.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcKVO } = require('../../src/chart/indicators/calc/kvo.js');

function makeCandlesHLCV(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`,
        open: (r[0] + r[1]) / 2,
        high: r[0],
        low: r[1],
        close: r[2],
        volume: r[3],
    }));
}

describe('calcKVO', () => {
    it('empty candles → empty {shortEma,longEma,oscillator}', () => {
        assert.deepStrictEqual(calcKVO([]), { shortEma: [], longEma: [], oscillator: [] });
    });

    it('not enough samples → all null', () => {
        const rows = [];
        for (let i = 0; i < 10; i++) rows.push([10 + i, 5 + i, 7 + i, 100]);
        const r = calcKVO(makeCandlesHLCV(rows));
        for (const p of r.oscillator) assert.strictEqual(p.value, null);
    });

    it('three series each have candles.length entries', () => {
        const rows = [];
        for (let i = 0; i < 100; i++) rows.push([10 + i * 0.1, 5 + i * 0.1, 7 + i * 0.1, 100]);
        const r = calcKVO(makeCandlesHLCV(rows), { shortPeriod: 5, longPeriod: 10 });
        assert.strictEqual(r.shortEma.length, 100);
        assert.strictEqual(r.longEma.length, 100);
        assert.strictEqual(r.oscillator.length, 100);
    });

    it('short-EMA forms before long-EMA (shorter warm-up)', () => {
        const rows = [];
        for (let i = 0; i < 20; i++) rows.push([10 + i, 5 + i, 7 + i, 100]);
        const r = calcKVO(makeCandlesHLCV(rows), { shortPeriod: 3, longPeriod: 8 });
        // shortPeriod=3 means short-EMA non-null from index 2
        assert.notStrictEqual(r.shortEma[2].value, null);
        // longPeriod=8 means long-EMA non-null from index 7
        assert.strictEqual(r.longEma[6].value, null);
        assert.notStrictEqual(r.longEma[7].value, null);
        // oscillator non-null only once both formed (i.e. from index 7)
        assert.strictEqual(r.oscillator[6].value, null);
        assert.notStrictEqual(r.oscillator[7].value, null);
    });

    it('hlc strictly rising with constant volume V → sv = +V always → both EMAs converge to V → oscillator = 0', () => {
        // hlc[i] = (high+low+close)/3. Rising hlc means sign is always +1.
        const rows = [];
        for (let i = 0; i < 200; i++) rows.push([100 + i, 95 + i, 97 + i, 50]);
        const r = calcKVO(makeCandlesHLCV(rows), { shortPeriod: 3, longPeriod: 8 });
        // After plenty of warm-up both EMAs settle at +50 → oscillator ≈ 0
        const last = r.oscillator[r.oscillator.length - 1].value;
        assert.ok(Math.abs(last) < 1e-6, `expected ~0, got ${last}`);
    });

    it('oscillator = shortEma - longEma at every formed index', () => {
        const rows = [];
        for (let i = 0; i < 40; i++) {
            const base = 100 + Math.sin(i / 2) * 10;
            rows.push([base + 1, base - 1, base, 100 + (i % 5) * 20]);
        }
        const r = calcKVO(makeCandlesHLCV(rows), { shortPeriod: 4, longPeriod: 9 });
        for (let i = 0; i < rows.length; i++) {
            if (r.shortEma[i].value !== null && r.longEma[i].value !== null) {
                assert.ok(Math.abs(r.oscillator[i].value - (r.shortEma[i].value - r.longEma[i].value)) < 1e-9,
                    `i=${i}: oscillator must equal shortEma - longEma`);
            } else {
                assert.strictEqual(r.oscillator[i].value, null);
            }
        }
    });

    it('time pass-through on all three series', () => {
        const rows = [];
        for (let i = 0; i < 10; i++) rows.push([10 + i, 5 + i, 7 + i, 100]);
        const candles = makeCandlesHLCV(rows);
        const r = calcKVO(candles, { shortPeriod: 3, longPeriod: 5 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.shortEma[i].time, candles[i].time);
            assert.strictEqual(r.longEma[i].time, candles[i].time);
            assert.strictEqual(r.oscillator[i].time, candles[i].time);
        }
    });
});
