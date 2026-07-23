const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    CompareAlignment,
    CompareController,
    CompareMode,
} = require('../src/workspace/compare-controller.js');

function candle(time, close) {
    return { time, open: close, high: close, low: close, close };
}

function schedule(timeZone) {
    return {
        id: timeZone,
        timeZone,
        sessions: [{
            id: 'regular',
            kind: 'regular',
            weekdays: [1, 2, 3, 4, 5],
            open: { hour: 9, minute: 30 },
            close: { hour: 16, minute: 0 },
        }],
    };
}

function sourceDouble(options = {}) {
    const histories = options.histories || {
        AAPL: [candle(1, 100), candle(2, 110), candle(3, 121)],
        MSFT: [candle(1, 50), candle(3, 55)],
    };
    return {
        resolves: [],
        bars: [],
        subscriptions: [],
        async resolveSymbol(request, signal) {
            this.resolves.push({ request, signal });
            if (options.resolveError) throw options.resolveError;
            return {
                id: request.symbol,
                name: `${request.symbol} name`,
                tradingSchedule: options.schedules?.[request.symbol],
            };
        },
        async getBars(request, signal) {
            this.bars.push({ request, signal });
            if (options.barsError) throw options.barsError;
            return { bars: histories[request.symbol] || [], hasMoreBefore: false };
        },
        subscribeBars(request, listener, errorListener) {
            const subscription = {
                request,
                listener,
                errorListener,
                unsubscribed: 0,
            };
            this.subscriptions.push(subscription);
            return () => { subscription.unsubscribed++; };
        },
    };
}

function seriesDouble(options) {
    let values = [];
    let currentOptions = { ...options };
    return {
        optionWrites: [],
        setData(points) { values = [...points]; },
        update(point) {
            if (values.length > 0 && values[values.length - 1].time === point.time)
                values[values.length - 1] = point;
            else values.push(point);
        },
        prependData(points) { values = [...points, ...values]; },
        data: () => [...values],
        barsInLogicalRange: () => null,
        applyOptions(patch) {
            this.optionWrites.push(patch);
            currentOptions = { ...currentOptions, ...patch };
        },
        options: () => ({ ...currentOptions }),
    };
}

function chartDouble(originalTimeScale = { mode: 'continuous', timeZone: 'UTC' }) {
    const series = [];
    const removed = [];
    const scaleWrites = [];
    const chartWrites = [];
    const logicalListeners = new Set();
    const crosshairListeners = new Set();
    let visibleRange = { from: 2, to: 3 };
    const chart = {
        addSeries(_definition, options) {
            const value = seriesDouble(options);
            series.push(value);
            return value;
        },
        removeSeries(value) { removed.push(value); },
        priceScale() {
            return {
                options: () => ({
                    mode: 0,
                    autoScale: true,
                    scaleMargins: { top: 0, bottom: 0 },
                }),
                applyOptions: patch => scaleWrites.push(patch),
            };
        },
        timeScale() {
            return {
                getVisibleRange: () => visibleRange,
                getVisibleLogicalRange: () => null,
                subscribeVisibleLogicalRangeChange: listener => logicalListeners.add(listener),
                unsubscribeVisibleLogicalRangeChange: listener => logicalListeners.delete(listener),
                scrollToRealTime() {},
            };
        },
        options: () => ({ timeScale: { ...originalTimeScale } }),
        applyOptions: patch => chartWrites.push(patch),
        subscribeCrosshairMove: listener => crosshairListeners.add(listener),
        unsubscribeCrosshairMove: listener => crosshairListeners.delete(listener),
    };
    return {
        chart,
        series,
        removed,
        scaleWrites,
        chartWrites,
        logicalListeners,
        crosshairListeners,
        setVisibleRange: range => { visibleRange = range; },
        crosshair(time) {
            for (const listener of crosshairListeners) listener({ time });
        },
    };
}

function compare(chart, source, options = {}) {
    return new CompareController({
        chart: chart.chart,
        dataSource: source,
        data: {
            autoPrefetch: false,
            reconnectPolicy: { enabled: false },
        },
        ...options,
    });
}

describe('CompareController', () => {
    it('owns independent symbol subscriptions and matches visible-base normalization in legend', async () => {
        const chart = chartDouble();
        const source = sourceDouble();
        const controller = compare(chart, source);

        const aapl = await controller.add({ symbol: 'AAPL', resolution: '1m' });
        const msft = await controller.add({ symbol: 'MSFT', resolution: '5m' });

        assert.equal(aapl.primary, true);
        assert.equal(controller.get(aapl.id).symbol, 'AAPL');
        assert.equal(msft.primary, false);
        assert.equal(aapl.label, 'AAPL name');
        assert.notEqual(aapl.color, msft.color);
        assert.deepEqual(source.subscriptions.map(item => item.request), [
            { symbol: 'AAPL', resolution: '1m' },
            { symbol: 'MSFT', resolution: '5m' },
        ]);
        assert.equal(chart.series[0].options().priceScaleId, 'left');
        assert.equal(chart.series[0].options().persist, false);
        assert.deepEqual(chart.series[0].data(), [
            { time: 1, value: 100 },
            { time: 2, value: 110 },
            { time: 3, value: 121 },
        ]);
        assert.equal(chart.scaleWrites.at(-1).mode, CompareMode.Percentage);
        controller.setColor(msft.id, '#010203');
        controller.setVisible(msft.id, false);
        assert.equal(controller.get(msft.id).color, '#010203');
        assert.equal(controller.get(msft.id).visible, false);
        assert.equal(chart.series[1].options().visible, false);

        const atThree = controller.legend(3);
        assert.ok(Math.abs(atThree[0].changePercent - 10) < 1e-9);
        assert.equal(atThree[0].displayValue, atThree[0].changePercent);
        assert.equal(atThree[1].changePercent, 0);
        assert.equal(controller.legend(2)[1].rawValue, null);

        controller.setMode(CompareMode.IndexedTo100);
        assert.ok(Math.abs(controller.legend(3)[0].displayValue - 110) < 1e-9);
        assert.equal(chart.scaleWrites.at(-1).mode, CompareMode.IndexedTo100);

        const states = [];
        controller.subscribe(state => states.push(state));
        chart.crosshair(3);
        assert.equal(states.at(-1).crosshairTime, 3);
        assert.equal(states.at(-1).legend[1].rawValue, 55);

        source.subscriptions[0].listener({ bar: candle(4, 133.1), isFinal: false });
        assert.equal(controller.series(aapl.id).data().at(-1).value, 133.1);
        assert.equal(controller.series(msft.id).data().at(-1).value, 55);

        assert.equal(controller.remove(aapl.id), true);
        assert.equal(source.subscriptions[0].unsubscribed, 1);
        assert.equal(controller.snapshot().primaryId, msft.id);
        controller.dispose();
        assert.equal(source.subscriptions[1].unsubscribed, 1);
        assert.equal(chart.crosshairListeners.size, 0);
        assert.equal(chart.removed.length, 2);
        assert.equal(chart.scaleWrites.at(-1).mode, 0);
    });

    it('projects through the selected primary calendar and restores chart alignment', async () => {
        const chart = chartDouble({ mode: 'ordinal', locale: 'en-US' });
        const source = sourceDouble({
            schedules: {
                AAPL: schedule('America/New_York'),
                MSFT: schedule('Europe/Moscow'),
            },
        });
        const controller = compare(chart, source, {
            alignment: CompareAlignment.PrimarySession,
        });

        const aapl = await controller.add({ id: 'aapl', symbol: 'AAPL', resolution: '1m' });
        await controller.add({ id: 'msft', symbol: 'MSFT', resolution: '1m' });
        assert.equal(chart.chartWrites.at(-1).timeScale.mode, 'session-aware');
        assert.equal(chart.chartWrites.at(-1).timeScale.timeZone, 'America/New_York');
        assert.equal(chart.chartWrites.at(-1).timeScale.calendar.schedule().timeZone,
            'America/New_York');

        controller.setPrimary('msft');
        assert.equal(chart.chartWrites.at(-1).timeScale.timeZone, 'Europe/Moscow');
        const writesBeforeRealtime = chart.chartWrites.length;
        source.subscriptions[1].listener({ bar: candle(4, 60) });
        assert.equal(chart.chartWrites.length, writesBeforeRealtime);

        controller.setAlignment(CompareAlignment.Chart);
        assert.equal(chart.chartWrites.at(-1).timeScale.mode, 'ordinal');
        assert.equal(chart.chartWrites.at(-1).timeScale.locale, 'en-US');
        assert.equal(chart.chartWrites.at(-1).timeScale.calendar, undefined);
        assert.equal(Object.hasOwn(chart.chartWrites.at(-1).timeScale, 'calendar'), true);
        assert.equal(controller.snapshot().primaryId === aapl.id, false);
        controller.dispose();
    });

    it('keeps a failed instrument inspectable and releasable for explicit retry UX', async () => {
        const chart = chartDouble();
        const source = sourceDouble({ barsError: new Error('history unavailable') });
        const controller = compare(chart, source);

        await assert.rejects(
            controller.add({ id: 'failed', symbol: 'FAIL', resolution: '1d' }),
            /history unavailable/,
        );
        assert.equal(controller.instruments().length, 1);
        assert.equal(controller.instruments()[0].status, 'error');
        assert.match(controller.instruments()[0].error.message, /history unavailable/);
        assert.equal(controller.remove('failed'), true);
        assert.equal(chart.removed.length, 1);
        controller.dispose();
    });
});
