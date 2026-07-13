// Market Meanness Index tests.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMarketMeannessIndex } = require('../../src/chart/indicators/calc/mmi.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        open: c,
        high: c,
        low: c,
        close: c,
        volume: 0,
    }));
}

describe('calcMarketMeannessIndex', () => {
    it('strictly monotonic series → 0 (no direction changes)', () => {
        // 5 rising closes; length=5 ⇒ formed at index 4.
        const closes = [1, 2, 3, 4, 5];
        const out = calcMarketMeannessIndex(makeCandles(closes), { length: 5 });
        assert.strictEqual(out.length, 5);
        for (let i = 0; i < 4; i++) assert.strictEqual(out[i].value, null);
        // 4 transitions, all +1, prevDirection never flips → 0%.
        assert.strictEqual(out[4].value, 0);
    });

    it('zig-zag series → 100 (every direction is a flip)', () => {
        // 1,2,1,2,1 — every step flips direction.
        const closes = [1, 2, 1, 2, 1];
        const out = calcMarketMeannessIndex(makeCandles(closes), { length: 5 });
        // priceChanges=4, directionChanges happen when newDir != prevDirection
        // (and prevDirection != 0). Step 1→2: prevDir was 0, no flip count.
        // Step 2→1: prevDir was +1, new -1 → flip. Step 1→2: prevDir -1, new +1 → flip.
        // Step 2→1: prevDir +1, new -1 → flip. Total flips=3. MMI = 100*3/4 = 75.
        assert.strictEqual(out[4].value, 75);
    });

    it('constant series → priceChanges=0 → 0', () => {
        const closes = [5, 5, 5, 5, 5];
        const out = calcMarketMeannessIndex(makeCandles(closes), { length: 5 });
        assert.strictEqual(out[4].value, 0);
    });

    it('sliding window: old transitions drop out', () => {
        // length=3. Closes: 1,2,3,2,1
        // Window after candle 0..2: [1,2,3] → trans (1→2)+,(2→3)+ priceChanges=2 dirChanges=0 → 0
        // Window after candle 1..3: [2,3,2] → trans (2→3)+,(3→2)- priceChanges=2 dirChanges=1 → 50
        // Window after candle 2..4: [3,2,1] → trans (3→2)-,(2→1)- priceChanges=2 dirChanges=0 → 0
        const out = calcMarketMeannessIndex(makeCandles([1, 2, 3, 2, 1]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, 0);
        assert.strictEqual(out[3].value, 50);
        assert.strictEqual(out[4].value, 0);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(calcMarketMeannessIndex([], { length: 5 }), []);
    });

    it('insufficient candles → all null', () => {
        const out = calcMarketMeannessIndex(makeCandles([1, 2]), { length: 10 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('preserves candle.time', () => {
        const candles = makeCandles([1, 2, 3]);
        const out = calcMarketMeannessIndex(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
