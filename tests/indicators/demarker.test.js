// DeMarker: empty/oversize warm-up + hand-computed reference + bounds.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcDeMarker } = require('../../src/chart/indicators/calc/demarker.js');

function makeCandles(hl) {
    return hl.map((p, i) => ({
        time: `t${i}`,
        open: (p[0] + p[1]) / 2,
        high: p[0],
        low: p[1],
        close: (p[0] + p[1]) / 2,
        volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcDeMarker', () => {
    it('empty → empty', () => {
        assert.deepStrictEqual(calcDeMarker([], { length: 14 }), []);
    });

    it('length too big → all null', () => {
        const r = calcDeMarker(makeCandles([[2,1],[3,2],[4,3]]), { length: 14 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('first non-null at index = length (bar 0 cached, then length samples needed)', () => {
        const r = calcDeMarker(
            makeCandles([[2,1],[3,2],[4,3],[5,4],[6,5]]),
            { length: 3 },
        );
        // length=3 → SMA needs 3 deMax samples (bars 1,2,3) ⇒ first formed at i=3.
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        assert.strictEqual(r[2].value, null);
        assert.notStrictEqual(r[3].value, null);
    });

    it('strictly rising highs and lows: deMin=0 across the board → DeMarker=1', () => {
        // highs/lows both rising every bar.
        const candles = makeCandles([[2,1],[3,2],[4,3],[5,4],[6,5],[7,6]]);
        const r = calcDeMarker(candles, { length: 3 });
        for (let i = 3; i < r.length; i++) approxEq(r[i].value, 1);
    });

    it('strictly falling highs and lows: deMax=0 → DeMarker=0', () => {
        const candles = makeCandles([[10,9],[9,8],[8,7],[7,6],[6,5],[5,4]]);
        const r = calcDeMarker(candles, { length: 3 });
        for (let i = 3; i < r.length; i++) approxEq(r[i].value, 0);
    });

    it('totally flat highs and lows: deMax=deMin=0 → fallback 0.5', () => {
        const candles = makeCandles([[5,4],[5,4],[5,4],[5,4],[5,4],[5,4]]);
        const r = calcDeMarker(candles, { length: 3 });
        for (let i = 3; i < r.length; i++) approxEq(r[i].value, 0.5);
    });

    it('hand-computed length=2 reference', () => {
        // candles (h,l):
        // i=0: (10, 5)
        // i=1: (12, 4)
        // i=2: (11, 6)
        // i=3: (13, 3)
        //
        // i=1: deMax=12-10=2, deMin=max(0, 5-4)=1
        // i=2: deMax=max(0,11-12)=0, deMin=max(0,4-6)=0
        // i=3: deMax=13-11=2, deMin=max(0,6-3)=3
        //
        // length=2 → first formed at i=2.
        //   i=2 SMA window over (1,2): max=(2+0)/2=1, min=(1+0)/2=0.5
        //       DeMarker = 1/(1+0.5) = 2/3
        //   i=3 SMA window over (2,3): max=(0+2)/2=1, min=(0+3)/2=1.5
        //       DeMarker = 1/(1+1.5) = 1/2.5 = 0.4
        const r = calcDeMarker(makeCandles([[10,5],[12,4],[11,6],[13,3]]), { length: 2 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, 2 / 3);
        approxEq(r[3].value, 0.4);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([[2,1],[3,2],[4,3],[5,4]]);
        const r = calcDeMarker(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
