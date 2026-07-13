// PsychologicalLine: sliding upCount / length per .cs.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcPsychologicalLine } = require('../../src/chart/indicators/calc/psychologicalline.js');

function mk(close, i) {
    return { time: `t${i}`, open: close, high: close, low: close, close, volume: 1 };
}

describe('calcPsychologicalLine', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcPsychologicalLine([], {}), []);
    });

    it('first (length-1) bars are null', () => {
        const closes = [1, 2, 3, 4, 5];
        const r = calcPsychologicalLine(closes.map(mk), { length: 4 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        assert.strictEqual(r[2].value, null);
        assert.notStrictEqual(r[3].value, null);
    });

    it('monotonic increasing: all up-steps → upCount = length-1', () => {
        // length=4, closes=[1,2,3,4]: when bar4 (i=3) emits,
        // buffer=[1], add 2 → upCount=1, buffer=[1,2]
        // buffer=[1,2], add 3 → upCount=2, buffer=[1,2,3]
        // buffer=[1,2,3], add 4 → upCount=3, buffer=[1,2,3,4]
        // pl = 3 / 4 = 0.75
        const r = calcPsychologicalLine([1,2,3,4].map(mk), { length: 4 });
        assert.strictEqual(r[3].value, 0.75);
    });

    it('monotonic decreasing: no up-steps → upCount = 0', () => {
        const r = calcPsychologicalLine([5,4,3,2,1].map(mk), { length: 4 });
        assert.strictEqual(r[3].value, 0);
        assert.strictEqual(r[4].value, 0);
    });

    it('output length equals input length', () => {
        const r = calcPsychologicalLine([1,2,3,4,5,6,7].map(mk), { length: 3 });
        assert.strictEqual(r.length, 7);
    });

    it('time field passed through', () => {
        const candles = [1,2,3,4].map(mk);
        const r = calcPsychologicalLine(candles, { length: 3 });
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].time, candles[i].time);
    });
});
