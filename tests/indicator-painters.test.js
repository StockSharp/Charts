const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.SSChart = {
    LineSeries: { type: 'Line' },
    HistogramSeries: { type: 'Histogram' },
    AreaSeries: { type: 'Area' },
    BandSeries: { type: 'Band' },
};

const { IndicatorRenderer } = require('../src/chart/indicators/indicator-renderer.js');
const { IndicatorEngine } = require('../src/chart/indicators/indicator-engine.js');
const { getClientCatalog } = require('../src/chart/indicators/calc/index.js');
const {
    hasIndicatorPainter,
    registerIndicatorPainter,
} = require('../src/chart/indicators/painters/index.js');

function chartMock() {
    return {
        added: [],
        removed: [],
        addSeries(definition, options) {
            const series = {
                definition,
                options,
                data: null,
                levels: [],
                setData(data) { this.data = data; },
                createPriceLine(options) { this.levels.push(options); },
            };
            this.added.push(series);
            return series;
        },
        removeSeries(series) { this.removed.push(series); },
    };
}

describe('indicator painters', () => {
    it('uses plain lines when the catalog has no painter', () => {
        const chart = chartMock();
        const renderer = new IndicatorRenderer(chart);
        const first = [{ time: 1, value: 10 }];
        const second = [{ time: 2, value: 11 }];
        const entry = { type: 'SimpleMovingAverage', outputNames: ['value'], seriesRefs: [] };
        const settings = { name: 'SMA' };

        entry.seriesRefs = renderer.render(entry, first, null, settings);
        assert.equal(chart.added.length, 1);
        assert.equal(chart.added[0].definition.type, 'Line');
        assert.deepEqual(chart.added[0].data, first);

        renderer.update(entry, second, null, settings);
        assert.deepEqual(chart.added[0].data, second);
    });

    it('resolves the painter named by the catalog and delegates updates', () => {
        const chart = chartMock();
        const renderer = new IndicatorRenderer(chart);
        let updates = 0;
        let disposed = 0;
        const unregister = registerIndicatorPainter('test-custom', () => ({
            paint(context) {
                const color = context.nextColor();
                const series = context.addSeries('histogram', { color }, context.output('bars'));
                return { series: [series], colors: [color] };
            },
            update(context, series) {
                updates++;
                series[0].setData(context.output('bars'));
            },
            dispose() { disposed++; },
        }));

        try {
            const entry = { type: 'CustomIndicator', outputNames: ['bars'], seriesRefs: [] };
            const settings = { name: 'Custom', painter: 'test-custom' };
            entry.seriesRefs = renderer.render(entry, { bars: [{ time: 1, value: 2 }] }, null, settings);
            assert.equal(chart.added[0].definition.type, 'Histogram');

            renderer.update(entry, { bars: [{ time: 2, value: 3 }] }, null, settings);
            assert.equal(updates, 1);
            assert.deepEqual(chart.added[0].data, [{ time: 2, value: 3 }]);

            renderer.removeSeries(entry);
            assert.equal(disposed, 1);
            assert.equal(chart.removed.length, 1);
        } finally {
            unregister();
        }
    });

    it('catalog painter names all resolve and ordinary indicators remain unassigned', () => {
        const catalog = getClientCatalog();
        const configured = catalog.filter(entry => entry.painter);
        assert.ok(configured.length >= 10);
        for (const entry of configured) {
            assert.ok(hasIndicatorPainter(entry.painter), `${entry.id}: unknown painter '${entry.painter}'`);
        }

        const sma = catalog.find(entry => entry.id === 'SimpleMovingAverage');
        assert.equal(sma.painter, undefined);
        assert.equal(catalog.find(entry => entry.id === 'BollingerBands').painter, 'band');
        assert.equal(catalog.find(entry => entry.id === 'VolumeIndicator').painter, 'volume');
        const fractals = catalog.find(entry => entry.id === 'Fractals');
        assert.deepEqual(fractals.params[0], { key: 'length', default: 5, min: 3, max: 99, step: 2 });
    });

    it('uses catalog-selected built-ins for bands and volume', () => {
        const catalog = getClientCatalog();

        const bandChart = chartMock();
        const bandRenderer = new IndicatorRenderer(bandChart);
        const bandSettings = catalog.find(entry => entry.id === 'BollingerBands');
        const bandEntry = { type: bandSettings.id, outputNames: ['upper', 'middle', 'lower'], seriesRefs: [] };
        const point = [{ time: 1, value: 10 }];
        bandEntry.seriesRefs = bandRenderer.render(bandEntry, {
            upper: point,
            middle: point,
            lower: point,
        }, null, bandSettings);
        assert.equal(bandEntry.seriesRefs.length, 2);
        assert.deepEqual(bandEntry.seriesRefs.map(series => series.definition.type), ['Band', 'Line']);
        assert.deepEqual(bandEntry.seriesRefs[0].data, [{ time: 1, value: 10, upper: 10, lower: 10 }]);

        const volumeChart = chartMock();
        const volumeRenderer = new IndicatorRenderer(volumeChart);
        const volumeSettings = catalog.find(entry => entry.id === 'VolumeIndicator');
        const volumeEntry = { type: volumeSettings.id, outputNames: ['value'], seriesRefs: [] };
        volumeEntry.seriesRefs = volumeRenderer.render(volumeEntry, [
            { time: 1, value: 100, up: true },
            { time: 2, value: 80, up: false },
        ], null, volumeSettings);
        assert.equal(volumeEntry.seriesRefs[0].definition.type, 'Histogram');
        assert.equal(volumeEntry.seriesRefs[0].data[0].color, '#00c853');
        assert.equal(volumeEntry.seriesRefs[0].data[1].color, '#ff3d57');
    });

    it('renders Ichimoku as three lines plus a Senkou cloud band', () => {
        const chart = chartMock();
        const renderer = new IndicatorRenderer(chart);
        const settings = getClientCatalog().find(entry => entry.id === 'Ichimoku');
        const entry = {
            type: 'Ichimoku',
            outputNames: ['tenkan', 'kijun', 'senkouA', 'senkouB', 'chikou'],
            seriesRefs: [],
        };
        const line = value => [{ time: 1, value }];
        const data = {
            tenkan: line(10),
            kijun: line(11),
            senkouA: line(12),
            senkouB: line(8),
            chikou: line(9),
        };

        entry.seriesRefs = renderer.render(entry, data, null, settings);

        assert.deepEqual(entry.seriesRefs.map(series => series.definition.type), ['Line', 'Line', 'Line', 'Band']);
        assert.deepEqual(entry.seriesRefs[3].data, [{ time: 1, value: 10, upper: 12, lower: 8 }]);
        assert.equal(entry.seriesRefs[3].options.positiveFillColor, 'rgba(50,205,50,0.18)');
        assert.deepEqual(renderer.getLastColors(), ['#FF6347', '#1E90FF', '#32CD32', '#FF1493', '#EE82EE']);
    });

    it('resolves legend outputs from the exact rendered seriesData snapshot', () => {
        const chart = chartMock();
        const renderer = new IndicatorRenderer(chart);
        const settings = getClientCatalog().find(entry => entry.id === 'BollingerBands');
        const entry = {
            id: 1,
            type: settings.id,
            params: { length: 20, stdDev: 2 },
            paneId: null,
            outputNames: ['upper', 'middle', 'lower'],
            seriesRefs: [],
            colors: [],
        };
        const line = value => [{ time: 10, value }];
        entry.seriesRefs = renderer.render(entry, {
            upper: line(20), middle: line(15), lower: line(10),
        }, null, settings);

        const engine = new IndicatorEngine();
        engine._indicators = [entry];
        const seriesData = new Map([
            [entry.seriesRefs[0], { time: 10, value: 15.5, upper: 21, lower: 10 }],
            [entry.seriesRefs[1], { time: 10, value: 16 }],
        ]);
        assert.deepEqual(engine.getValuesAt(10, seriesData)[0].values, {
            upper: 21,
            middle: 16,
            lower: 10,
        });
        assert.deepEqual(engine.getValuesAt(11, new Map())[0].values, {
            upper: null,
            middle: null,
            lower: null,
        });
    });

    it('falls back to a line when a configured painter is unavailable', () => {
        const chart = chartMock();
        const renderer = new IndicatorRenderer(chart);
        const entry = { type: 'PluginIndicator', outputNames: ['value'], seriesRefs: [] };
        const originalWarn = console.warn;
        console.warn = () => {};
        try {
            entry.seriesRefs = renderer.render(entry, [{ time: 1, value: 5 }], null, {
                name: 'Plugin',
                painter: 'not-installed',
            });
        } finally {
            console.warn = originalWarn;
        }
        assert.equal(chart.added[0].definition.type, 'Line');
    });

    it('aligns shifted sparse values and legend with the exact pivot bars', () => {
        const engine = new IndicatorEngine();
        const candles = Array.from({ length: 6 }, (_, i) => ({
            time: 1_700_000_000 + i * 60,
            open: 1,
            high: 2,
            low: 0,
            close: 1,
        }));
        engine.setCandles(candles);

        const shifted = engine._applyPointShifts({
            up: [{ time: candles[4].time, value: 5, shift: 2 }],
            down: [{ time: candles[5].time, value: -3, shift: 1 }],
        });
        assert.equal(shifted.up[0].time, candles[2].time);
        assert.equal(shifted.down[0].time, candles[4].time);

        const legend = engine._buildLegendPoints({}, shifted);
        assert.deepEqual(legend, [
            { time: candles[2].time, values: { up: 5 } },
            { time: candles[4].time, values: { down: -3 } },
        ]);

        engine._indicators = [{
            id: 1,
            type: 'Fractals',
            params: { length: 5 },
            paneId: null,
            outputNames: ['up', 'down'],
            colors: ['#32CD32', '#FF3D57'],
            _points: legend,
            _lastValues: legend[legend.length - 1].values,
        }];

        const valuesAt = time => engine.getValuesAt(time)[0].values;
        assert.deepEqual(valuesAt(candles[1].time), { up: null, down: null });
        assert.deepEqual(valuesAt(candles[2].time), { up: 5, down: null });
        assert.deepEqual(valuesAt(candles[3].time), { up: null, down: null });
        assert.deepEqual(valuesAt(candles[4].time), { up: null, down: -3 });
        assert.deepEqual(engine.getValuesAt()[0].values, { up: null, down: -3 });
    });

    it('does not carry a shifted single-output value into adjacent candles', () => {
        const engine = new IndicatorEngine();
        const candles = Array.from({ length: 5 }, (_, i) => ({
            time: 1_710_000_000 + i * 300,
            open: 10,
            high: 12,
            low: 8,
            close: 10,
        }));
        engine.setCandles(candles);

        const shifted = engine._applyPointShifts([
            { time: candles[4].time, value: 12, shift: 2 },
        ]);
        const points = engine._buildLegendPoints({}, shifted);
        engine._indicators = [{
            id: 1,
            type: 'Peak',
            params: { deviation: 0.001 },
            paneId: null,
            outputNames: ['value'],
            colors: ['#32CD32'],
            _points: points,
            _lastValues: points[0].values,
        }];

        const valuesAt = time => engine.getValuesAt(time)[0].values;
        assert.deepEqual(valuesAt(candles[1].time), { value: null });
        assert.deepEqual(valuesAt(candles[2].time), { value: 12 });
        assert.deepEqual(valuesAt(candles[3].time), { value: null });
        assert.deepEqual(engine.getValuesAt()[0].values, { value: 12 });
    });
});
