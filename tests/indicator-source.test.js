const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.SSChart = {
    LineSeries: { type: 'Line' },
    HistogramSeries: { type: 'Histogram' },
    AreaSeries: { type: 'Area' },
    BandSeries: { type: 'Band' },
};

const {
    IndicatorCandleField,
    IndicatorSourceKind,
    IndicatorSourceStatusReason,
    normalizeIndicatorSource,
} = require('../src/indicators/index.js');
const { IndicatorEngineStateAdapter } = require('../src/persistence/index.js');
const { IndicatorEngine } = require('../src/chart/indicators/indicator-engine.js');
const { IndicatorRenderer } = require('../src/chart/indicators/indicator-renderer.js');

function rendererChart() {
    const series = [];
    return {
        series,
        addSeries(definition, initial = {}) {
            let options = { ...initial };
            const item = {
                definition,
                data: [],
                setDataCalls: 0,
                options: () => ({ ...options }),
                applyOptions(patch) { options = { ...options, ...patch }; },
                setData(data) { this.setDataCalls++; this.data = [...data]; },
                update(point) {
                    if (this.data.at(-1)?.time === point.time) this.data[this.data.length - 1] = point;
                    else this.data.push(point);
                },
                pop(count = 1) { return this.data.splice(-count, count); },
                createPriceLine() {},
            };
            series.push(item);
            return item;
        },
        removeSeries(item) {
            const index = series.indexOf(item);
            if (index >= 0) series.splice(index, 1);
        },
    };
}

function closes(series) {
    return series.data.map(point => [point.time, point.value]);
}

function candles() {
    return Array.from({ length: 6 }, (_, index) => ({
        time: index + 1,
        open: (index + 1) * 10,
        high: (index + 1) * 10 + 2,
        low: (index + 1) * 10 - 2,
        close: index + 1,
        volume: 100 + index,
    }));
}

describe('indicator source binding', () => {
    it('normalizes a strict immutable discriminated union', () => {
        const source = normalizeIndicatorSource({
            kind: IndicatorSourceKind.IndicatorOutput,
            indicatorId: ' source ',
            outputId: ' line ',
        });
        assert.deepEqual(source, {
            kind: 'indicator-output', indicatorId: 'source', outputId: 'line',
        });
        assert.equal(Object.isFrozen(source), true);
        assert.throws(() => normalizeIndicatorSource({
            kind: IndicatorSourceKind.CandleField, field: 'invalid',
        }), /field is invalid/);
        assert.throws(() => normalizeIndicatorSource({
            kind: IndicatorSourceKind.Candles, extra: true,
        }), /extra.*unsupported/);
    });

    it('chains outputs in dependency order and rebinds without replacing runtime objects', async () => {
        const chart = rendererChart();
        const engine = new IndicatorEngine();
        const sourceCandles = candles();
        engine.setRenderer(new IndicatorRenderer(chart));
        engine.setCandles(sourceCandles);

        const upstream = engine.add('SimpleMovingAverage', { length: 2 }, '__main__', {
            persistenceId: 'upstream',
        });
        const downstream = engine.add('SimpleMovingAverage', { length: 2 }, '__main__', {
            persistenceId: 'downstream',
            source: {
                kind: IndicatorSourceKind.IndicatorOutput,
                indicatorId: 'upstream',
                outputId: 'line',
            },
        });
        assert.deepEqual(closes(upstream.seriesRefs[0]), [
            [2, 1.5], [3, 2.5], [4, 3.5], [5, 4.5], [6, 5.5],
        ]);
        assert.deepEqual(closes(downstream.seriesRefs[0]), [
            [3, 2], [4, 3], [5, 4], [6, 5],
        ]);

        const identities = {
            upstreamRuntime: upstream.runtime,
            downstreamRuntime: downstream.runtime,
            upstreamSeries: upstream.seriesRefs[0],
            downstreamSeries: downstream.seriesRefs[0],
        };
        assert.equal(engine.setSource(upstream.id, {
            kind: IndicatorSourceKind.CandleField,
            field: IndicatorCandleField.Open,
        }), true);
        assert.equal(upstream.runtime, identities.upstreamRuntime);
        assert.equal(downstream.runtime, identities.downstreamRuntime);
        assert.equal(upstream.seriesRefs[0], identities.upstreamSeries);
        assert.equal(downstream.seriesRefs[0], identities.downstreamSeries);
        assert.deepEqual(closes(upstream.seriesRefs[0]), [
            [2, 15], [3, 25], [4, 35], [5, 45], [6, 55],
        ]);
        assert.deepEqual(closes(downstream.seriesRefs[0]), [
            [3, 20], [4, 30], [5, 40], [6, 50],
        ]);
        assert.deepEqual(engine.getSourceStatus(downstream.id), {
            source: {
                kind: 'indicator-output', indicatorId: 'upstream', outputId: 'line',
            },
            available: true,
            reason: IndicatorSourceStatusReason.Ready,
        });

        assert.throws(() => engine.setSource(upstream.id, {
            kind: IndicatorSourceKind.IndicatorOutput,
            indicatorId: 'downstream',
            outputId: 'line',
        }), /cycle/);
        assert.throws(() => engine.setSource(downstream.id, {
            kind: IndicatorSourceKind.IndicatorOutput,
            indicatorId: 'upstream',
            outputId: 'missing',
        }), /output 'missing' is unavailable/);

        let mappedSourceSamples = 0;
        const runtimeInputFromScalar = engine._runtimeInputFromScalar.bind(engine);
        engine._runtimeInputFromScalar = (...args) => {
            mappedSourceSamples++;
            return runtimeInputFromScalar(...args);
        };
        sourceCandles.at(-1).open = 80;
        engine.onLiveUpdate();
        await new Promise(resolve => setTimeout(resolve, 10));
        assert.deepEqual(closes(upstream.seriesRefs[0]).at(-1), [6, 65]);
        assert.deepEqual(closes(downstream.seriesRefs[0]).at(-1), [6, 55]);
        assert.ok(mappedSourceSamples <= 3, 'live source update must not remap full history');
        engine._runtimeInputFromScalar = runtimeInputFromScalar;

        const adapter = new IndicatorEngineStateAdapter({ engine });
        const snapshot = adapter.capture();
        assert.deepEqual(snapshot.find(item => item.id === 'upstream').source, {
            kind: 'candle-field', field: 'open',
        });
        assert.deepEqual(snapshot.find(item => item.id === 'downstream').source, {
            kind: 'indicator-output', indicatorId: 'upstream', outputId: 'line',
        });

        await adapter.clear();
        await adapter.restore([...snapshot].reverse());
        const restored = engine.getIndicators().find(item => item.persistenceId === 'downstream');
        const restoredUpstream = engine.getIndicators().find(item => item.persistenceId === 'upstream');
        assert.deepEqual(closes(restored.seriesRefs[0]), [
            [3, 20], [4, 30], [5, 40], [6, 55],
        ]);

        const restoredRuntime = restored.runtime;
        engine.remove(restoredUpstream.id);
        assert.equal(engine.getSourceStatus(restored.id).reason, 'missing-indicator');
        assert.deepEqual(closes(restored.seriesRefs[0]), []);
        engine.add('SimpleMovingAverage', { length: 2 }, '__main__', {
            persistenceId: 'upstream',
            source: { kind: IndicatorSourceKind.CandleField, field: IndicatorCandleField.Open },
        });
        assert.equal(engine.getSourceStatus(restored.id).reason, 'ready');
        assert.equal(restored.runtime, restoredRuntime);
        assert.deepEqual(closes(restored.seriesRefs[0]), [
            [3, 20], [4, 30], [5, 40], [6, 55],
        ]);
    });

    it('validates the complete persisted dependency graph before restoring', async () => {
        const engine = new IndicatorEngine();
        engine.setRenderer(new IndicatorRenderer(rendererChart()));
        engine.setCandles(candles());
        const adapter = new IndicatorEngineStateAdapter({ engine });
        const indicator = (id, dependency) => ({
            id,
            type: 'SimpleMovingAverage',
            paneId: null,
            params: { length: 2 },
            styles: {},
            source: {
                kind: IndicatorSourceKind.IndicatorOutput,
                indicatorId: dependency,
                outputId: 'line',
            },
        });

        await assert.rejects(adapter.restore([
            indicator('left', 'right'), indicator('right', 'left'),
        ]), /source graph contains a cycle/);
        assert.deepEqual(engine.getIndicators(), []);
        await assert.rejects(adapter.restore([
            indicator('dependent', 'missing'),
        ]), /source 'missing' is unavailable/);
        assert.deepEqual(engine.getIndicators(), []);
    });

    it('propagates shifted preview corrections on their source timestamp', async () => {
        const chart = rendererChart();
        const engine = new IndicatorEngine();
        const lows = [0, -1, -3, -1, 0, 0, 0, -1, -4, -1, 0];
        const sourceCandles = lows.map((low, index) => ({
            time: 1_720_000_000 + index * 60,
            open: low + 1,
            high: low + 2,
            low,
            close: low + 1,
            volume: 1,
        }));
        engine.setRenderer(new IndicatorRenderer(chart));
        engine.setCandles(sourceCandles);
        const fractals = engine.add('Fractals', { length: 5 }, '__main__', {
            persistenceId: 'fractals',
        });
        const dependent = engine.add('ExponentialMovingAverage', { length: 2 }, '__main__', {
            persistenceId: 'fractal-average',
            source: {
                kind: IndicatorSourceKind.IndicatorOutput,
                indicatorId: 'fractals',
                outputId: 'down',
            },
        });
        assert.deepEqual(closes(fractals.seriesRefs[1]), [
            [sourceCandles[2].time, -3],
            [sourceCandles[8].time, -4],
        ]);
        assert.deepEqual(closes(dependent.seriesRefs[0]), [
            [sourceCandles[8].time, -3.5],
        ]);
        const runtime = dependent.runtime;
        const setDataCalls = dependent.seriesRefs[0].setDataCalls;

        sourceCandles.at(-1).low = -5;
        engine.onLiveUpdate();
        await new Promise(resolve => setTimeout(resolve, 10));

        assert.deepEqual(closes(fractals.seriesRefs[1]), [
            [sourceCandles[2].time, -3],
        ]);
        assert.deepEqual(closes(dependent.seriesRefs[0]), []);
        assert.equal(dependent.runtime, runtime);
        assert.equal(dependent.seriesRefs[0].setDataCalls, setDataCalls);
    });
});
