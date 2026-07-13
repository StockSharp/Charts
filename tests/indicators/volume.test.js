// Volume indicator: pass-through with up/down colour hint.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcVolume } = require('../../src/chart/indicators/calc/volume.js');

describe('calcVolume', () => {
    it('empty candle array → empty result', () => {
        assert.deepStrictEqual(calcVolume([], {}), []);
    });

    it('all candles pass through value and up flag', () => {
        const candles = [
            { time: 't0', open: 10, high: 11, low: 9, close: 11, volume: 100 },
            { time: 't1', open: 11, high: 12, low: 10, close: 10, volume: 200 },
            { time: 't2', open: 10, high: 10, low: 10, close: 10, volume: 50 },
        ];
        const out = calcVolume(candles, {});
        assert.strictEqual(out.length, 3);
        assert.deepStrictEqual(out[0], { time: 't0', value: 100, up: true });
        assert.deepStrictEqual(out[1], { time: 't1', value: 200, up: false });
        // close == open → up:true (treated as flat/neutral, defaulting to up)
        assert.deepStrictEqual(out[2], { time: 't2', value: 50, up: true });
    });

    it('missing/non-finite volume → value:null, up still derived from open/close', () => {
        const candles = [
            { time: 't0', open: 10, high: 11, low: 9, close: 11 },          // no volume
            { time: 't1', open: 11, high: 12, low: 10, close: 10, volume: NaN },
            { time: 't2', open: 10, high: 11, low: 9, close: 9, volume: 0 },
        ];
        const out = calcVolume(candles, {});
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[0].up, true);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[1].up, false);
        // volume=0 is finite — should pass through as 0
        assert.strictEqual(out[2].value, 0);
        assert.strictEqual(out[2].up, false);
    });

    it('non-finite open or close → up defaults to true', () => {
        const candles = [
            { time: 't0', open: NaN, high: 11, low: 9, close: 11, volume: 100 },
        ];
        const out = calcVolume(candles, {});
        assert.strictEqual(out[0].up, true);
        assert.strictEqual(out[0].value, 100);
    });

    it('time field passed through unchanged', () => {
        const candles = [
            { time: 'a', open: 1, high: 1, low: 1, close: 1, volume: 1 },
            { time: 'b', open: 2, high: 2, low: 2, close: 2, volume: 2 },
        ];
        const out = calcVolume(candles);
        assert.strictEqual(out[0].time, 'a');
        assert.strictEqual(out[1].time, 'b');
    });
});
