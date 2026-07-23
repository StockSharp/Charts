const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    PointFigureDataRuntime,
    RenkoDataRuntime,
    preparePointFigureData,
    prepareRenkoData,
} = require('../src/series/derived-data.js');
const { builtInSeriesDefinitions } = require('../src/series/built-in-renderers.js');

function candle(time, close) {
    return { time, open: close, high: close + 1, low: close - 1, close };
}

function prices(data) {
    return data.map(({ open, high, low, close }) => ({ open, high, low, close }));
}

describe('derived data runtimes', () => {
    it('replaces only the provisional Renko tail and keeps committed times stable', () => {
        const source = [
            candle(100, 10), candle(200, 12), candle(300, 14), candle(400, 16),
        ];
        const runtime = new RenkoDataRuntime(1);
        runtime.reset(source);
        const committed = runtime.data.slice(0, 4);

        const replacement = candle(400, 13);
        source[source.length - 1] = replacement;
        const patch = runtime.update(replacement);

        assert.equal(patch.fromIndex, 4);
        assert.equal(patch.removed, 2);
        assert.deepEqual(runtime.data.slice(0, 4), committed);
        assert.deepEqual(prices(runtime.data), prices(prepareRenkoData(source, 1).data));
    });

    it('fixes the automatic Renko box for subsequent live updates', () => {
        const source = [candle(100, 10), candle(200, 11), candle(300, 12)];
        const runtime = new RenkoDataRuntime();
        runtime.reset(source);
        const box = runtime.boxSize;
        const times = runtime.data.map(point => point.time);

        runtime.update(candle(400, 30));

        assert.equal(runtime.boxSize, box);
        assert.deepEqual(runtime.data.slice(0, times.length).map(point => point.time), times);
        assert.ok(runtime.data.length > times.length);
    });

    it('restores a forming Point & Figure column before replace-last', () => {
        const source = [
            candle(100, 10), candle(200, 12), candle(300, 14), candle(400, 16),
        ];
        const runtime = new PointFigureDataRuntime(1, 2);
        runtime.reset(source);
        const firstTime = runtime.data[0].time;

        const replacement = candle(400, 11);
        source[source.length - 1] = replacement;
        const patch = runtime.update(replacement);

        assert.equal(patch.fromIndex, 0);
        assert.equal(runtime.data[0].time, firstTime);
        assert.deepEqual(
            prices(runtime.data),
            prices(preparePointFigureData(source, 1, 2).data),
        );
    });

    it('emits no patch when an older derived input is ignored', () => {
        const renko = new RenkoDataRuntime(1);
        renko.reset([candle(100, 10), candle(200, 12)]);
        assert.equal(renko.update(candle(150, 50)), null);

        const pointFigure = new PointFigureDataRuntime(1, 3);
        pointFigure.reset([candle(100, 10), candle(200, 12)]);
        assert.equal(pointFigure.update(candle(150, 50)), null);
    });

    it('wires both built-in derived series through incremental processor factories', () => {
        for (const type of ['Renko', 'PointFigure']) {
            const definition = builtInSeriesDefinitions.find(item => item.type === type);
            assert.equal(definition.dataProcessor, undefined);
            assert.equal(typeof definition.incrementalDataProcessorFactory, 'function');
            const processor = definition.incrementalDataProcessorFactory();
            const initial = processor.reset([
                candle(100, 10), candle(200, 12), candle(300, 14),
            ], { boxSize: 1, reversal: 2 });
            const prefix = initial.data.slice(0, Math.max(0, initial.data.length - 1));

            const patch = processor.update(candle(300, 11), {
                boxSize: 1, reversal: 2,
            }, 'update');

            assert.ok(patch === null || patch.fromIndex >= prefix.length - 1);
            assert.equal(initial.metadata.box, 1);
        }
    });
});
