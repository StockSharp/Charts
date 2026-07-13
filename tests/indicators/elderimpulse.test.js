// Elder Impulse System: empty/oversize warm-up + state/value mapping for
// strictly rising / falling / mixed regimes.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcElderImpulse } = require('../../src/chart/indicators/calc/elderimpulse.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcElderImpulse', () => {
    it('empty → empty', () => {
        assert.deepStrictEqual(calcElderImpulse([], {}), []);
    });

    it('length too big → all null', () => {
        // Default slowLen=26 means first formed at bar >= 26.
        const closes = [];
        for (let i = 1; i <= 20; i++) closes.push(i);
        const r = calcElderImpulse(makeCandles(closes), {});
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('accelerating up closes → green (+1) once formed', () => {
        // Use small lengths so we can fit a strictly rising series.
        // emaLen=3, fastLen=2, slowLen=3.
        // EMA(3) seed at i=2, fast(2) seed at i=1, slow(3) seed at i=2.
        // macdLine first valid at i=2. Need i-1's macd too → first elder at i=3.
        //
        // Note: a *linear* ramp ⇒ constant MACD line after warm-up (fast
        // EMA - slow EMA both track the same slope), so neither rising nor
        // falling and Elder emits 0. We need *accelerating* closes to keep
        // MACD line strictly increasing.
        const closes = [];
        for (let i = 1; i <= 15; i++) closes.push(i * i);
        const r = calcElderImpulse(makeCandles(closes), { emaLength: 3, fastLength: 2, slowLength: 3 });
        for (let i = 3; i < r.length; i++) {
            assert.strictEqual(r[i].value, 1, `bar ${i}: expected +1, got ${r[i].value}`);
            assert.strictEqual(r[i].state, 'green');
        }
    });

    it('accelerating down closes → red (-1) once formed', () => {
        // Same reasoning as the rising test — need acceleration not just a
        // slope, but in the opposite direction. closes[i] = 1000 - i² so
        // each step is a bigger drop than the previous.
        const closes = [];
        for (let i = 1; i <= 15; i++) closes.push(1000 - i * i);
        const r = calcElderImpulse(makeCandles(closes), { emaLength: 3, fastLength: 2, slowLength: 3 });
        for (let i = 3; i < r.length; i++) {
            assert.strictEqual(r[i].value, -1, `bar ${i}: expected -1, got ${r[i].value}`);
            assert.strictEqual(r[i].state, 'red');
        }
    });

    it('linear ramp up → MACD line is constant → blue (0) after seed', () => {
        // Documents the .cs behaviour: a perfectly linear close series
        // makes (fast EMA - slow EMA) converge to a constant. The
        // "current MACD > prev MACD" check is therefore false, and Elder
        // emits 0/blue even though closes are monotonically rising.
        const closes = [];
        for (let i = 1; i <= 15; i++) closes.push(i);
        const r = calcElderImpulse(makeCandles(closes), { emaLength: 3, fastLength: 2, slowLength: 3 });
        // After both EMAs have a few samples post-seed (say from i=5+),
        // MACD line is constant → output is 0.
        for (let i = 5; i < r.length; i++) {
            assert.strictEqual(r[i].value, 0, `bar ${i}: linear ramp should give 0, got ${r[i].value}`);
        }
    });

    it('flat closes after seed → EMA constant, MACD line constant → blue (0)', () => {
        // After both EMAs converge on a constant series, neither rises nor falls.
        const closes = new Array(20).fill(50);
        const r = calcElderImpulse(makeCandles(closes), { emaLength: 3, fastLength: 2, slowLength: 3 });
        for (let i = 3; i < r.length; i++) {
            // Equal values → neither > nor < → blue (0).
            assert.strictEqual(r[i].value, 0, `bar ${i}: expected 0, got ${r[i].value}`);
            assert.strictEqual(r[i].state, 'blue');
        }
    });

    it('reversal regime → emits both green and red states', () => {
        // Acceleration up then deceleration / acceleration down. Use
        // squares to make MACD line actually move.
        const closes = [
            1, 4, 9, 16, 25, 36, 49, 64, 81, 100, // accelerating up
            81, 64, 49, 36, 25, 16, 9, 4, 1,       // decelerating / down
        ];
        const r = calcElderImpulse(makeCandles(closes), { emaLength: 3, fastLength: 2, slowLength: 3 });
        const formed = r.filter(p => p.value !== null);
        assert.ok(formed.length > 0);
        const hasGreen = formed.some(p => p.value === 1);
        const hasRed = formed.some(p => p.value === -1);
        assert.ok(hasGreen, 'expected at least one green bar in the formed segment');
        assert.ok(hasRed, 'expected at least one red bar in the formed segment');
    });

    it('shape: output has candles.length entries with pass-through time', () => {
        const candles = makeCandles([1,2,3,4,5,6,7,8,9,10]);
        const r = calcElderImpulse(candles, { emaLength: 3, fastLength: 2, slowLength: 3 });
        assert.strictEqual(r.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
