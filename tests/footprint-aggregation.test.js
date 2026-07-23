const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    FootprintAggregator,
    TradeAggressorSide,
    aggregateFootprintBars,
    footprintBarVolume,
} = require('../src/orderflow/index.js');

const options = { tickSize: 0.25, barDuration: 60 };

function trade(time, price, volume, aggressorSide, id, sequence) {
    return { time, price, volume, aggressorSide, id, sequence };
}

describe('FootprintAggregator', () => {
    it('derives exact OHLC and bid/ask levels from classified executions', () => {
        const source = [
            trade(60, 100, 2, TradeAggressorSide.Buy, '1'),
            trade(61, 99.75, 3, TradeAggressorSide.Sell, '2'),
            trade(62, 100, 5, TradeAggressorSide.Sell, '3'),
            trade(119, 100.25, 7, TradeAggressorSide.Buy, '4'),
            trade(120, 100, 11, TradeAggressorSide.Sell, '5'),
        ];

        const bars = aggregateFootprintBars(source, options);

        assert.equal(bars.length, 2);
        assert.deepEqual(
            {
                time: bars[0].time,
                open: bars[0].open,
                high: bars[0].high,
                low: bars[0].low,
                close: bars[0].close,
            },
            { time: 60, open: 100, high: 100.25, low: 99.75, close: 100.25 },
        );
        assert.deepEqual(bars[0].levels, [
            { price: 99.75, bidVolume: 3, askVolume: 0, tradeCount: 1 },
            { price: 100, bidVolume: 5, askVolume: 2, tradeCount: 2 },
            { price: 100.25, bidVolume: 0, askVolume: 7, tradeCount: 1 },
        ]);
        assert.equal(footprintBarVolume(bars[0]), 17);
        assert.equal(footprintBarVolume(bars[1]), 11);
        assert.equal(
            bars.reduce((sum, bar) => sum + footprintBarVolume(bar), 0),
            source.reduce((sum, item) => sum + item.volume, 0),
        );
    });

    it('updates only the current immutable bar and preserves the committed prefix', () => {
        const runtime = new FootprintAggregator(options);
        runtime.reset([
            trade(60, 100, 2, TradeAggressorSide.Buy, '1'),
            trade(120, 101, 3, TradeAggressorSide.Sell, '2'),
        ]);
        const before = runtime.snapshot();

        const tailPatch = runtime.push(
            trade(121, 101.25, 4, TradeAggressorSide.Buy, '3'),
        );
        const afterTail = runtime.snapshot();
        const appendPatch = runtime.push(
            trade(180, 102, 5, TradeAggressorSide.Buy, '4'),
        );
        const afterAppend = runtime.snapshot();

        assert.deepEqual(
            { kind: tailPatch.kind, fromIndex: tailPatch.fromIndex, removed: tailPatch.removed },
            { kind: 'update', fromIndex: 1, removed: 1 },
        );
        assert.equal(tailPatch.data.length, 1);
        assert.equal(afterTail[0], before[0]);
        assert.notEqual(afterTail[1], before[1]);
        assert.equal(before[1].levels.length, 1);
        assert.deepEqual(
            {
                kind: appendPatch.kind,
                fromIndex: appendPatch.fromIndex,
                removed: appendPatch.removed,
            },
            { kind: 'append', fromIndex: 2, removed: 0 },
        );
        assert.equal(afterAppend[0], afterTail[0]);
        assert.equal(afterAppend[1], afterTail[1]);
        assert.equal(Object.isFrozen(appendPatch.data), true);
        assert.equal(runtime.latest, afterAppend[2]);
    });

    it('aligns intervals to an explicit origin and leaves missing intervals absent', () => {
        const bars = aggregateFootprintBars([
            trade(100, 10, 1, TradeAggressorSide.Buy),
            trade(165, 11, 1, TradeAggressorSide.Sell),
            trade(300, 12, 1, TradeAggressorSide.Buy),
        ], { tickSize: 1, barDuration: 60, timeOrigin: 10 });

        assert.deepEqual(bars.map(bar => bar.time), [70, 130, 250]);
    });

    it('rejects invalid ordering and duplicate ids atomically', () => {
        const runtime = new FootprintAggregator(options);
        runtime.push(trade(60, 100, 2, TradeAggressorSide.Buy, 'same', 2));
        const before = runtime.snapshot();

        assert.throws(
            () => runtime.push(trade(59, 100, 1, TradeAggressorSide.Sell, 'older')),
            /time cannot move backwards/,
        );
        assert.throws(
            () => runtime.push(trade(60, 100, 1, TradeAggressorSide.Sell, 'next', 1)),
            /sequence cannot move backwards/,
        );
        assert.throws(
            () => runtime.push(trade(61, 100, 1, TradeAggressorSide.Sell, 'same')),
            /duplicate order-flow trade id/,
        );
        assert.deepEqual(runtime.snapshot(), before);
    });

    it('validates configuration even when the input snapshot is empty', () => {
        assert.throws(
            () => new FootprintAggregator({ tickSize: 0, barDuration: 60 }),
            /tickSize must be positive/,
        );
        assert.throws(
            () => aggregateFootprintBars([], { tickSize: 1, barDuration: 0 }),
            /barDuration must be positive/,
        );
    });
});
