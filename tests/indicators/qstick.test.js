// QStick: SMA of (open - close) over Length. C# uses "divide by Length even
// before window is full" semantics; we verify both warm-up partial averages
// and steady-state output.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcQStick } = require('../../src/chart/indicators/calc/qstick.js');

function makeCandles(rows) {
    // rows: array of {o,c}
    return rows.map((r, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: r.o, high: r.h ?? Math.max(r.o, r.c),
        low: r.l ?? Math.min(r.o, r.c),
        close: r.c, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`);
}

describe('calcQStick', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcQStick([], { length: 5 }), []);
    });

    it('length=3 partial-window averages from bar 0 (sum / Length)', () => {
        // diffs (open-close): 10-5=5, 20-10=10, 30-20=10, 40-30=10, 50-40=10
        // bar 0: sum=5,  out = 5/3
        // bar 1: sum=15, out = 15/3 = 5
        // bar 2: sum=25, out = 25/3
        // bar 3: window slides — drop 5, add 10. sum=30. out = 30/3 = 10
        // bar 4: drop 10, add 10. sum=30. out = 10
        const out = calcQStick(makeCandles([
            { o: 10, c: 5 },
            { o: 20, c: 10 },
            { o: 30, c: 20 },
            { o: 40, c: 30 },
            { o: 50, c: 40 },
        ]), { length: 3 });
        assert.strictEqual(out.length, 5);
        approxEq(out[0].value, 5 / 3);
        approxEq(out[1].value, 5);
        approxEq(out[2].value, 25 / 3);
        approxEq(out[3].value, 10);
        approxEq(out[4].value, 10);
    });

    it('sign convention: close > open (green) → negative value', () => {
        // open=1, close=10 → diff = 1-10 = -9. length=1 → -9.
        const out = calcQStick(makeCandles([{ o: 1, c: 10 }]), { length: 1 });
        approxEq(out[0].value, -9);
    });

    it('sign convention: close < open (red) → positive value', () => {
        const out = calcQStick(makeCandles([{ o: 10, c: 1 }]), { length: 1 });
        approxEq(out[0].value, 9);
    });

    it('default length=15 — first output is (open[0]-close[0])/15', () => {
        const out = calcQStick(makeCandles([{ o: 6832, c: 6927 }]));
        // (6832 - 6927) / 15 = -95 / 15 ≈ -6.333
        approxEq(out[0].value, (6832 - 6927) / 15);
    });

    it('NaN open or close on a bar → null until it drops out of the window', () => {
        // length=2
        // bar 0: open=10, close=NaN → invalid → null
        // bar 1: open=2, close=1 → diff=1, but window still contains bar 0 (invalid) → null
        // bar 2: open=4, close=1 → diff=3. bar 0 drops out (window=[bar 1, bar 2]). sum=1+3=4, out=4/2=2
        const candles = [
            { time: 't0', open: 10, high: 10, low: 10, close: NaN, volume: 0 },
            { time: 't1', open: 2, high: 2, low: 1, close: 1, volume: 0 },
            { time: 't2', open: 4, high: 4, low: 1, close: 1, volume: 0 },
        ];
        const out = calcQStick(candles, { length: 2 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        approxEq(out[2].value, 2);
    });

    it('time field is preserved verbatim per bar', () => {
        const candles = makeCandles([{ o: 1, c: 1 }, { o: 2, c: 2 }, { o: 3, c: 3 }]);
        const out = calcQStick(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
