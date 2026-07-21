const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.SSChart = {
    LineSeries: { type: 'Line' },
    HistogramSeries: { type: 'Histogram' },
    AreaSeries: { type: 'Area' },
    BandSeries: { type: 'Band' },
};

const { IndicatorRenderer } = require('../src/chart/indicators/indicator-renderer.js');
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
});
