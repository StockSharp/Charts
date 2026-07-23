const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    DrawingMagnet,
    DrawingMagnetMode,
} = require('../src/drawings/index.js');

function fakeSeries(values, offset = 0) {
    return {
        magnetValues: data => values(data),
        priceToCoordinate: price => price + offset,
    };
}

function input(series, data, price = 100, y = 100) {
    return {
        time: 10,
        price,
        coordinate: { x: 40, y },
        pane: { series: () => series },
        seriesData: data,
    };
}

describe('DrawingMagnet', () => {
    it('snaps weak mode only inside its CSS-pixel threshold', () => {
        const near = fakeSeries(point => point.levels);
        const magnet = new DrawingMagnet({ mode: DrawingMagnetMode.Weak, maxDistance: 8 });
        const data = new Map([[near, { time: 12, levels: [92, 104, 120] }]]);

        const snapped = magnet.resolve(input([near], data, 101, 100));
        assert.deepEqual(snapped.point, { time: 12, price: 104 });
        assert.equal(snapped.snapped, true);
        assert.equal(snapped.series, near);
        assert.equal(snapped.distance, 4);

        const untouched = magnet.resolve(input([near], data, 101, 130));
        assert.deepEqual(untouched.point, { time: 10, price: 101 });
        assert.equal(untouched.snapped, false);
        assert.equal(untouched.distance, null);
    });

    it('strong mode picks the nearest candidate across every series in the pane', () => {
        const candles = fakeSeries(point => point.ohlc);
        const indicator = fakeSeries(point => [point.value], 50);
        const foreign = fakeSeries(() => [150]);
        const data = new Map([
            [candles, { time: 10, ohlc: [80, 90, 100, 110] }],
            [indicator, { time: 11, value: 61 }],
            [foreign, { time: 10 }],
        ]);
        const magnet = new DrawingMagnet({ mode: DrawingMagnetMode.Strong });

        const snapped = magnet.resolve(input([candles, indicator], data, 300, 112));
        assert.deepEqual(snapped.point, { time: 11, price: 61 });
        assert.equal(snapped.series, indicator);
        assert.equal(snapped.distance, 1);
    });

    it('none mode preserves the raw point and settings are validated atomically', () => {
        const series = fakeSeries(() => [100]);
        const data = new Map([[series, { time: 10 }]]);
        const magnet = new DrawingMagnet({ mode: DrawingMagnetMode.None });
        assert.deepEqual(magnet.resolve(input([series], data, 95, 100)).point, {
            time: 10,
            price: 95,
        });

        magnet.applyOptions({ mode: DrawingMagnetMode.Strong, maxDistance: 4 });
        assert.deepEqual(magnet.options(), { mode: 'strong', maxDistance: 4 });
        assert.throws(() => magnet.applyOptions({ mode: 'invalid' }), /unknown drawing magnet mode/);
        assert.deepEqual(magnet.options(), { mode: 'strong', maxDistance: 4 });
        assert.throws(() => magnet.applyOptions({ maxDistance: -1 }), /non-negative/);
    });

    it('ignores missing data, non-finite values and detached coordinates', () => {
        const invalid = fakeSeries(() => [NaN, Infinity]);
        const detached = { magnetValues: () => [100], priceToCoordinate: () => null };
        const magnet = new DrawingMagnet({ mode: DrawingMagnetMode.Strong });
        const resolved = magnet.resolve(input(
            [invalid, detached],
            new Map([[invalid, { time: 10 }], [detached, { time: 10 }]]),
            77,
            100,
        ));
        assert.deepEqual(resolved.point, { time: 10, price: 77 });
        assert.equal(resolved.snapped, false);
    });
});
