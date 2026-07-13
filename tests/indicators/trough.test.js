// Trough: ZigZag's down-pivots only, using candle LOW as price feed.
// Output is dense (length = candles.length); non-trough bars carry
// `value: null`.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcTrough } = require('../../src/chart/indicators/calc/trough.js');

function makeCandlesByLow(lows) {
    return lows.map((l, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: l,
        high: l,
        low: l,
        close: l,
        volume: 0,
    }));
}

describe('calcTrough', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcTrough([], { deviation: 0.05 }), []);
    });

    it('no swings beyond deviation → every value null', () => {
        const r = calcTrough(makeCandlesByLow([100, 100.1, 100.2, 100.15]), { deviation: 0.05 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('invalid deviation → all null', () => {
        const c = makeCandlesByLow([1, 2, 3, 4, 5, 4, 3, 2, 1]);
        for (const bad of [0, -0.1, 1, 1.5]) {
            const r = calcTrough(c, { deviation: bad });
            for (const p of r) assert.strictEqual(p.value, null);
        }
    });

    it('down-pivot is emitted; up-pivot is suppressed', () => {
        // lows: 15 14 13 12 11 10 9 8 7 8 9 10 11 12 (descend to 7 then rise).
        const lows = [15, 14, 13, 12, 11, 10, 9, 8, 7, 8, 9, 10];
        const out = calcTrough(makeCandlesByLow(lows), { deviation: 0.10 });
        assert.strictEqual(out.length, lows.length);
        let found = 0;
        for (let i = 0; i < lows.length; i++) {
            if (out[i].value !== null) {
                found++;
                assert.strictEqual(out[i].value, 7);
            }
        }
        assert.ok(found >= 1, 'expected at least one trough emission');
    });

    it('uses candle.low as price feed (not close)', () => {
        const candles = [];
        const lows = [50, 40, 45, 52, 50, 51, 52];
        for (let i = 0; i < lows.length; i++) {
            candles.push({ time: `t${i}`, open: 50, high: 55, low: lows[i], close: 50, volume: 0 });
        }
        const r = calcTrough(candles, { deviation: 0.10 });
        let found = -1;
        for (let i = 0; i < lows.length; i++) {
            if (r[i].value !== null) { found = i; break; }
        }
        assert.notStrictEqual(found, -1, 'expected a trough emission');
        assert.strictEqual(r[found].value, 40);
    });

    it('time field passed through on all bars', () => {
        const candles = makeCandlesByLow([15, 14, 13, 12, 11, 10]);
        const out = calcTrough(candles, { deviation: 0.10 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
