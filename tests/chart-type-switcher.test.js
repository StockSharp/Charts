const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.SSChart = {
    CandlestickSeries: { type: 'Candlestick' },
    BarSeries: { type: 'Bar' },
    LineSeries: { type: 'Line' },
    AreaSeries: { type: 'Area' },
    RenkoSeries: { type: 'Renko' },
    PointFigureSeries: { type: 'PointFigure' },
};

const { ChartTypeSwitcher } = require('../src/chart/chart-type-switcher.js');

function candle(time, close) {
    return { time, open: close, high: close + 1, low: close - 1, close };
}

function seriesMock(definition = null, options = null) {
    return {
        definition,
        options,
        data: [],
        updates: [],
        setData(data) { this.data = [...data]; },
        update(point) { this.updates.push(point); },
    };
}

function chartMock() {
    return {
        added: [],
        removed: [],
        addSeries(definition, options) {
            const series = seriesMock(definition, options);
            this.added.push(series);
            return series;
        },
        removeSeries(series) { this.removed.push(series); },
    };
}

describe('ChartTypeSwitcher', () => {
    it('shares one stable streaming Renko view with indicators', () => {
        const chart = chartMock();
        const initial = seriesMock();
        const source = [
            candle(100, 10), candle(200, 12), candle(300, 14), candle(400, 16),
        ];
        const switcher = new ChartTypeSwitcher();
        switcher.init(chart, initial, seriesMock());
        switcher.setRawCandles(source);

        const renko = switcher.switchType('renko');
        const derived = switcher.getIndicatorCandles();
        const committedTimes = derived.slice(0, 4).map(point => point.time);
        assert.ok(renko.options.boxSize > 0);
        assert.equal(derived, switcher.getIndicatorCandles());

        const replacement = candle(400, 13);
        source[source.length - 1] = replacement;
        switcher.updatePrice(replacement);

        assert.equal(renko.updates.length, 1);
        assert.equal(switcher.getIndicatorCandles(), derived);
        assert.deepEqual(
            derived.slice(0, 4).map(point => point.time),
            committedTimes,
        );

        switcher.switchType('candle');
        assert.equal(switcher.getIndicatorCandles(), source);
    });
});
