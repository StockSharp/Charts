const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    ChartDataController,
    ChartDataStatus,
} = require('../src/data/chart-data-controller.js');
const { ohlcvDataViewBuilder } = require('../src/data/aggregation.js');

function bar(time, close = time) {
    return { time, open: close, high: close + 1, low: close - 1, close };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function seriesDouble() {
    return {
        values: [],
        dataWrites: [],
        updateWrites: [],
        optionWrites: [],
        setData(points) {
            this.values = [...points];
            this.dataWrites.push([...points]);
        },
        update(point) {
            this.updateWrites.push(point);
            if (this.values.at(-1)?.time === point.time) this.values[this.values.length - 1] = point;
            else if (this.values.length === 0 || this.values.at(-1).time < point.time)
                this.values.push(point);
        },
        prependData(points) {
            const incoming = [...points];
            if (incoming.at(-1)?.time === this.values[0]?.time) this.values.shift();
            this.values.unshift(...incoming);
        },
        data() { return [...this.values]; },
        barsInLogicalRange(range) {
            if (this.values.length === 0) return null;
            const from = Math.max(0, Math.ceil(range.from));
            const to = Math.min(this.values.length - 1, Math.floor(range.to));
            if (to < from) return null;
            return {
                barsBefore: from,
                barsAfter: this.values.length - 1 - to,
                from: this.values[from].time,
                to: this.values[to].time,
            };
        },
        applyOptions(patch) { this.optionWrites.push(patch); },
    };
}

function timeScaleDouble() {
    const listeners = new Set();
    let range = null;
    let realtimeScrolls = 0;
    return {
        api: {
            getVisibleLogicalRange: () => range,
            subscribeVisibleLogicalRangeChange: (listener) => listeners.add(listener),
            unsubscribeVisibleLogicalRangeChange: (listener) => listeners.delete(listener),
            scrollToRealTime: () => { realtimeScrolls++; },
        },
        setRange(next) {
            range = next;
            for (const listener of listeners) listener(next);
        },
        listenerCount: () => listeners.size,
        realtimeScrolls: () => realtimeScrolls,
    };
}

function schedulerDouble() {
    let nextId = 1;
    const tasks = new Map();
    const delays = [];
    return {
        api: {
            setTimeout(callback, delayMs) {
                const id = nextId++;
                tasks.set(id, callback);
                delays.push(delayMs);
                return id;
            },
            clearTimeout(id) { tasks.delete(id); },
            random: () => 0.5,
        },
        runNext() {
            const entry = tasks.entries().next().value;
            if (entry === undefined) throw new Error('no scheduled reconnect');
            tasks.delete(entry[0]);
            entry[1]();
        },
        pending: () => tasks.size,
        delays,
    };
}

function sourceDouble(overrides = {}) {
    return {
        resolveCalls: [],
        barsCalls: [],
        subscriptions: [],
        async resolveSymbol(request, signal) {
            this.resolveCalls.push({ request, signal });
            return { id: request.symbol, priceFormat: { precision: 2, minMove: 0.01 } };
        },
        async getBars(request, signal) {
            this.barsCalls.push({ request, signal });
            return { bars: [bar(1), bar(2)], hasMoreBefore: true };
        },
        subscribeBars(request, listener, errorListener) {
            const subscription = {
                request, listener, errorListener, unsubscribeCalls: 0,
            };
            this.subscriptions.push(subscription);
            return () => { subscription.unsubscribeCalls++; };
        },
        ...overrides,
    };
}

function controller(source = sourceDouble(), series = seriesDouble(), options = {}) {
    const timeScale = timeScaleDouble();
    const chart = {
        optionWrites: [],
        timeScale: () => timeScale.api,
        applyOptions(patch) { this.optionWrites.push(patch); },
    };
    return {
        chart,
        source,
        series,
        timeScale,
        value: new ChartDataController({
            chart,
            series,
            dataSource: source,
            initialCount: 200,
            reconnectPolicy: { enabled: false },
            ...options,
        }),
    };
}

describe('ChartDataController', () => {
    it('resolves, loads, applies metadata, and publishes immutable state', async () => {
        const { value, source, series } = controller();
        const states = [];
        value.subscribe((state) => states.push(state));
        const info = await value.setSelection({ symbol: '  AAPL ', resolution: ' 1m ' });

        assert.equal(info.id, 'AAPL');
        assert.deepEqual(source.resolveCalls[0].request, { symbol: 'AAPL' });
        assert.deepEqual(source.barsCalls[0].request, {
            symbol: 'AAPL', resolution: '1m', countBack: 200,
        });
        assert.deepEqual(series.values, [bar(1), bar(2)]);
        assert.deepEqual(series.optionWrites, [{ priceFormat: { precision: 2, minMove: 0.01 } }]);
        assert.deepEqual(states.slice(0, 3).map((state) => state.status), [
            ChartDataStatus.Resolving,
            ChartDataStatus.Loading,
            ChartDataStatus.Ready,
        ]);
        assert.deepEqual(value.snapshot(), {
            status: ChartDataStatus.Ready,
            generation: 1,
            selection: { symbol: 'AAPL', resolution: '1m' },
            symbolInfo: { id: 'AAPL', priceFormat: { precision: 2, minMove: 0.01 } },
            loadedBars: 2,
            renderedBars: 2,
            groupingLevel: 1,
            realtimeStatus: 'connected',
            realtimeUpdates: 0,
            realtimeError: null,
            reconnectAttempt: 0,
            nextReconnectDelayMs: null,
            hasMoreBefore: true,
            hasMoreAfter: false,
            loadingHistory: false,
            historyError: null,
            error: null,
        });
        assert.equal(Object.isFrozen(value.snapshot()), true);
        assert.equal(Object.isFrozen(value.snapshot().selection), true);

        const same = await value.setSelection({ symbol: 'AAPL', resolution: '1m' });
        assert.equal(same, info);
        assert.equal(source.resolveCalls.length, 1);
        assert.deepEqual(source.subscriptions[0].request, { symbol: 'AAPL', resolution: '1m' });
        await value.reload();
        assert.equal(source.resolveCalls.length, 2);
    });

    it('normalizes and applies the resolved symbol trading schedule', async () => {
        const schedule = {
            id: 'XNYS',
            timeZone: 'America/New_York',
            sessions: [{
                id: 'regular',
                kind: 'regular',
                weekdays: [1, 2, 3, 4, 5],
                open: { hour: 9, minute: 30 },
                close: { hour: 16, minute: 0 },
            }],
            holidays: ['2026-07-03'],
        };
        const source = sourceDouble({
            async resolveSymbol(request, signal) {
                this.resolveCalls.push({ request, signal });
                return { id: request.symbol, tradingSchedule: schedule };
            },
        });
        const { value, chart } = controller(source);

        const info = await value.setSelection({ symbol: 'AAPL', resolution: '1m' });
        assert.equal(chart.optionWrites.length, 1);
        const calendar = chart.optionWrites[0].timeScale.calendar;
        assert.equal(calendar.schedule(), info.tradingSchedule);
        assert.equal(info.tradingSchedule.timeZone, 'America/New_York');
        assert.equal(Object.isFrozen(info.tradingSchedule), true);
        assert.equal(Object.isFrozen(info.tradingSchedule.sessions), true);
        assert.equal(Object.isFrozen(info.tradingSchedule.sessions[0]), true);
        assert.equal(Object.isFrozen(info.tradingSchedule.sessions[0].open), true);
        assert.equal(Object.isFrozen(info.tradingSchedule.holidays), true);

        schedule.timeZone = 'Europe/Moscow';
        schedule.sessions[0].open.hour = 12;
        schedule.holidays.push('2026-12-25');
        assert.equal(info.tradingSchedule.timeZone, 'America/New_York');
        assert.equal(info.tradingSchedule.sessions[0].open.hour, 9);
        assert.deepEqual(info.tradingSchedule.holidays, ['2026-07-03']);
        assert.equal(value.snapshot().symbolInfo.tradingSchedule, info.tradingSchedule);
    });

    it('clears its symbol calendar when the next symbol has no schedule', async () => {
        const source = sourceDouble({
            async resolveSymbol(request, signal) {
                this.resolveCalls.push({ request, signal });
                return request.symbol === 'AAPL'
                    ? {
                        id: request.symbol,
                        tradingSchedule: {
                            timeZone: 'UTC',
                            sessions: [{
                                id: 'always',
                                kind: 'regular',
                                weekdays: [1, 2, 3, 4, 5, 6, 7],
                                open: { hour: 0, minute: 0 },
                                close: { hour: 0, minute: 0 },
                                closeDayOffset: 1,
                            }],
                        },
                    }
                    : { id: request.symbol };
            },
        });
        const { value, chart } = controller(source);

        await value.setSelection({ symbol: 'AAPL', resolution: '1m' });
        await value.setSelection({ symbol: 'BTCUSD', resolution: '1m' });

        assert.equal(chart.optionWrites.length, 2);
        assert.equal(typeof chart.optionWrites[0].timeScale.calendar.sessionAt, 'function');
        assert.deepEqual(chart.optionWrites[1], { timeScale: { calendar: undefined } });
    });

    it('can leave chart calendar ownership to the caller', async () => {
        const source = sourceDouble({
            async resolveSymbol(request, signal) {
                this.resolveCalls.push({ request, signal });
                return {
                    id: request.symbol,
                    tradingSchedule: {
                        timeZone: 'UTC',
                        sessions: [{
                            id: 'always',
                            kind: 'regular',
                            weekdays: [1, 2, 3, 4, 5, 6, 7],
                            open: { hour: 0, minute: 0 },
                            close: { hour: 0, minute: 0 },
                            closeDayOffset: 1,
                        }],
                    },
                };
            },
        });
        const { value, chart } = controller(source, seriesDouble(), {
            applySymbolTradingSchedule: false,
        });

        const info = await value.setSelection({ symbol: 'BTCUSD', resolution: '1m' });
        assert.deepEqual(chart.optionWrites, []);
        assert.equal(Object.isFrozen(info.tradingSchedule), true);
    });

    it('deduplicates an identical in-flight selection', async () => {
        const pending = deferred();
        const source = sourceDouble({
            resolveSymbol(request, signal) {
                this.resolveCalls.push({ request, signal });
                return pending.promise;
            },
        });
        const { value } = controller(source);
        const first = value.setSelection({ symbol: 'AAPL', resolution: '1m' });
        const second = value.setSelection({ symbol: 'AAPL', resolution: '1m' });
        assert.equal(first, second);
        assert.equal(source.resolveCalls.length, 1);
        pending.resolve({ id: 'AAPL' });
        await first;
        assert.equal(source.barsCalls.length, 1);
    });

    it('aborts old work and ignores a stale source that resolves anyway', async () => {
        const symbols = { OLD: deferred(), NEW: deferred() };
        const source = sourceDouble({
            resolveSymbol(request, signal) {
                this.resolveCalls.push({ request, signal });
                return symbols[request.symbol].promise;
            },
            async getBars(request, signal) {
                this.barsCalls.push({ request, signal });
                return {
                    bars: request.symbol === 'NEW' ? [bar(20)] : [bar(10)],
                    hasMoreBefore: false,
                };
            },
        });
        const { value, series, chart } = controller(source);
        const oldLoad = value.setSelection({ symbol: 'OLD', resolution: '1m' });
        const oldSignal = source.resolveCalls[0].signal;
        const newLoad = value.setSelection({ symbol: 'NEW', resolution: '5m' });
        assert.equal(oldSignal.aborted, true);

        symbols.NEW.resolve({ id: 'NEW' });
        assert.equal((await newLoad).id, 'NEW');
        symbols.OLD.resolve({
            id: 'OLD',
            tradingSchedule: {
                timeZone: 'UTC',
                sessions: [{
                    id: 'always', kind: 'regular', weekdays: [1, 2, 3, 4, 5, 6, 7],
                    open: { hour: 0, minute: 0 }, close: { hour: 0, minute: 0 },
                    closeDayOffset: 1,
                }],
            },
        });
        assert.equal(await oldLoad, null);

        assert.deepEqual(series.values, [bar(20)]);
        assert.equal(series.dataWrites.length, 1);
        assert.deepEqual(source.barsCalls.map((call) => call.request.symbol), ['NEW']);
        assert.equal(value.snapshot().selection.symbol, 'NEW');
        assert.equal(value.snapshot().generation, 2);
        assert.deepEqual(chart.optionWrites, []);
    });

    it('reports current failures but suppresses aborted late failures', async () => {
        const source = sourceDouble({
            async getBars() { throw new Error('history unavailable'); },
        });
        const { value } = controller(source);
        await assert.rejects(
            value.setSelection({ symbol: 'ERR', resolution: '1h' }),
            /history unavailable/,
        );
        assert.equal(value.snapshot().status, ChartDataStatus.Error);
        assert.match(value.snapshot().error.message, /history unavailable/);

        const late = deferred();
        const staleSource = sourceDouble({
            resolveSymbol(request, signal) {
                this.resolveCalls.push({ request, signal });
                return late.promise;
            },
        });
        const next = controller(staleSource);
        const load = next.value.setSelection({ symbol: 'LATE', resolution: '1m' });
        next.value.dispose();
        late.reject(new Error('late failure'));
        assert.equal(await load, null);
        assert.equal(next.value.snapshot().status, ChartDataStatus.Disposed);
        assert.throws(() => next.value.setSelection({ symbol: 'X', resolution: '1m' }), /disposed/);
    });

    it('rejects malformed source payloads before mutating the series', async () => {
        const source = sourceDouble({
            async getBars() {
                return { bars: [{ time: Number.NaN }], hasMoreBefore: false };
            },
        });
        const { value, series } = controller(source);
        await assert.rejects(
            value.setSelection({ symbol: 'BAD', resolution: '1m' }),
            /invalid time/,
        );
        assert.equal(series.dataWrites.length, 0);
        assert.equal(value.snapshot().status, ChartDataStatus.Error);
    });

    it('deduplicates one in-flight history page and prepends only ordered older bars', async () => {
        const history = deferred();
        let calls = 0;
        const source = sourceDouble({
            async getBars(request, signal) {
                this.barsCalls.push({ request, signal });
                calls++;
                if (calls === 1) {
                    return { bars: [bar(100), bar(110)], hasMoreBefore: true };
                }
                return history.promise;
            },
        });
        const { value, series } = controller(source, seriesDouble(), {
            autoPrefetch: false,
            historyCount: 50,
        });
        await value.setSelection({ symbol: 'AAPL', resolution: '1m' });
        const first = value.loadMoreBefore();
        const second = value.loadMoreBefore();
        assert.equal(first, second);
        assert.equal(value.snapshot().loadingHistory, true);
        assert.deepEqual(source.barsCalls[1].request, {
            symbol: 'AAPL', resolution: '1m', to: 100, countBack: 50,
        });

        history.resolve({
            bars: [bar(80), bar(90), bar(90, 91), bar(100, 101)],
            hasMoreBefore: false,
        });
        assert.equal(await first, 2);
        assert.deepEqual(series.values.map((point) => [point.time, point.close]), [
            [80, 80], [90, 91], [100, 101], [110, 110],
        ]);
        assert.equal(value.snapshot().loadedBars, 4);
        assert.deepEqual(value.rawDataSlice(1, 3), [bar(90, 91), bar(100, 101)]);
        assert.equal(Object.isFrozen(value.rawDataSlice(0, 1)), true);
        assert.throws(() => value.rawDataSlice(-1, 1), /fromIndex/);
        assert.throws(() => value.rawDataSlice(3, 2), /toIndex must not precede/);
        assert.equal(value.snapshot().hasMoreBefore, false);
        assert.equal(value.snapshot().loadingHistory, false);
        assert.equal(value.snapshot().historyError, null);
        assert.equal(await value.loadMoreBefore(), 0);
    });

    it('uses barsBefore as the prefetch threshold and releases the range listener', async () => {
        let calls = 0;
        const source = sourceDouble({
            async getBars(request, signal) {
                this.barsCalls.push({ request, signal });
                calls++;
                return calls === 1
                    ? { bars: [bar(100), bar(110), bar(120)], hasMoreBefore: true }
                    : { bars: [bar(80), bar(90), bar(100)], hasMoreBefore: false };
            },
        });
        const { value, timeScale } = controller(source, seriesDouble(), {
            historyPrefetchThreshold: 1,
        });
        await value.setSelection({ symbol: 'AAPL', resolution: '1m' });
        assert.equal(timeScale.listenerCount(), 1);
        timeScale.setRange({ from: 2, to: 2 });
        await Promise.resolve();
        assert.equal(source.barsCalls.length, 1);
        timeScale.setRange({ from: 1, to: 2 });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(source.barsCalls.length, 2);
        assert.equal(value.snapshot().loadedBars, 5);
        value.dispose();
        assert.equal(timeScale.listenerCount(), 0);
    });

    it('keeps raw OHLCV bars while switching an aggregated render view', async () => {
        const source = sourceDouble({
            async getBars(request, signal) {
                this.barsCalls.push({ request, signal });
                return {
                    bars: [
                        bar(0, 10), bar(60, 12), bar(120, 14), bar(180, 16),
                    ],
                    hasMoreBefore: false,
                };
            },
        });
        const { value, series } = controller(source, seriesDouble(), {
            viewBuilder: ohlcvDataViewBuilder,
            initialGroupingLevel: 2,
            lodCacheSize: 3,
        });
        await value.setSelection({ symbol: 'AAPL', resolution: '1m' });

        assert.equal(value.snapshot().loadedBars, 4);
        assert.equal(value.snapshot().renderedBars, 2);
        assert.equal(value.snapshot().groupingLevel, 2);
        assert.equal(value.rawData().length, 4);
        assert.deepEqual(series.values.map((item) => [item.time, item.open, item.close]), [
            [0, 10, 12], [120, 14, 16],
        ]);
        assert.deepEqual(value.renderedData(), series.values);
        assert.equal(Object.isFrozen(value.renderedData()), true);

        value.setGroupingLevel(1);
        assert.equal(value.groupingLevel(), 1);
        assert.equal(value.snapshot().renderedBars, 4);
        assert.equal(series.values.length, 4);
        value.setGroupingLevel(2);
        assert.equal(value.lodCacheSnapshot().size, 2);
        assert.ok(value.lodCacheSnapshot().hits >= 1);
        assert.throws(() => value.setGroupingLevel(0), /positive integer/);

        const plain = controller(sourceDouble(), seriesDouble(), { autoPrefetch: false }).value;
        assert.throws(() => plain.setGroupingLevel(2), /viewBuilder/);
        plain.dispose();
    });

    it('applies realtime replace-last and append without replacing the full series', async () => {
        const { value, source, series, timeScale } = controller(
            sourceDouble(),
            seriesDouble(),
            { autoPrefetch: false, autoScrollRealtime: true },
        );
        await value.setSelection({ symbol: 'AAPL', resolution: '1m' });
        const stream = source.subscriptions[0];
        stream.listener({ bar: bar(2, 200), isFinal: false });
        stream.listener({ bar: bar(3, 300), isFinal: true });
        stream.listener({ bar: bar(1, 999) });

        assert.equal(series.dataWrites.length, 1);
        assert.deepEqual(series.updateWrites, [bar(2, 200), bar(3, 300)]);
        assert.deepEqual(series.values, [bar(1), bar(2, 200), bar(3, 300)]);
        assert.deepEqual(value.rawData(), [bar(1), bar(2, 200), bar(3, 300)]);
        assert.deepEqual(value.renderedData(), series.values);
        assert.equal(value.snapshot().loadedBars, 3);
        assert.equal(value.snapshot().renderedBars, 3);
        assert.equal(value.snapshot().realtimeUpdates, 2);
        assert.equal(value.snapshot().realtimeStatus, 'connected');
        assert.equal(timeScale.realtimeScrolls(), 1);
    });

    it('updates only the active OHLCV bucket for grouped realtime data', async () => {
        let builds = 0;
        let updates = 0;
        const source = sourceDouble({
            async getBars(request, signal) {
                this.barsCalls.push({ request, signal });
                return {
                    bars: [bar(0, 10), bar(60, 12), bar(120, 14), bar(180, 16)],
                    hasMoreBefore: false,
                };
            },
        });
        const { ohlcvDataViewUpdater } = require('../src/data/aggregation.js');
        const { value, series } = controller(source, seriesDouble(), {
            viewBuilder(bars, context) {
                builds++;
                return ohlcvDataViewBuilder(bars, context);
            },
            viewUpdater(bars, context, change) {
                updates++;
                return ohlcvDataViewUpdater(bars, context, change);
            },
            initialGroupingLevel: 2,
            autoPrefetch: false,
        });
        await value.setSelection({ symbol: 'AAPL', resolution: '1m' });
        const stream = source.subscriptions[0];
        for (let close = 17; close <= 26; close++)
            stream.listener({ bar: bar(180, close) });
        stream.listener({ bar: bar(240, 30) });

        assert.equal(builds, 1);
        assert.equal(updates, 11);
        assert.equal(series.dataWrites.length, 1);
        assert.equal(series.updateWrites.length, 11);
        assert.equal(series.values.length, 3);
        assert.deepEqual(series.values.map((item) => [item.time, item.close]), [
            [0, 12], [120, 26], [240, 30],
        ]);
        assert.equal(value.rawData().length, 5);
        assert.equal(value.snapshot().realtimeUpdates, 11);
    });

    it('unsubscribes on switch/dispose and ignores callbacks from an old generation', async () => {
        const source = sourceDouble();
        const { value, series } = controller(source);
        await value.setSelection({ symbol: 'OLD', resolution: '1m' });
        const oldStream = source.subscriptions[0];
        await value.setSelection({ symbol: 'NEW', resolution: '5m' });
        const newStream = source.subscriptions[1];
        assert.equal(oldStream.unsubscribeCalls, 1);
        oldStream.listener({ bar: bar(999, 999) });
        assert.equal(series.values.some((item) => item.time === 999), false);

        value.dispose();
        value.dispose();
        assert.equal(newStream.unsubscribeCalls, 1);
        assert.equal(value.snapshot().realtimeStatus, 'disconnected');
    });

    it('stops a failed stream and ignores callbacks delivered after unsubscribe', async () => {
        const source = sourceDouble();
        const { value, series } = controller(source);
        await value.setSelection({ symbol: 'AAPL', resolution: '1m' });
        const stream = source.subscriptions[0];
        stream.errorListener(new Error('socket closed'));
        assert.equal(stream.unsubscribeCalls, 1);
        assert.equal(value.snapshot().realtimeStatus, 'error');
        assert.match(value.snapshot().realtimeError.message, /socket closed/);
        stream.listener({ bar: bar(999, 999) });
        assert.equal(series.values.some((item) => item.time === 999), false);
    });

    it('resubscribes with bounded backoff without reloading history', async () => {
        const scheduler = schedulerDouble();
        let subscribeCalls = 0;
        const source = sourceDouble({
            subscribeBars(request, listener, errorListener) {
                subscribeCalls++;
                if (subscribeCalls === 2) throw new Error('dial failed');
                const subscription = {
                    request, listener, errorListener, unsubscribeCalls: 0,
                };
                this.subscriptions.push(subscription);
                return () => { subscription.unsubscribeCalls++; };
            },
        });
        const { value } = controller(source, seriesDouble(), {
            reconnectPolicy: {
                enabled: true,
                initialDelayMs: 100,
                maxDelayMs: 1_000,
                multiplier: 2,
                maxAttempts: 3,
                jitterRatio: 0,
            },
            realtimeScheduler: scheduler.api,
        });
        await value.setSelection({ symbol: 'AAPL', resolution: '1m' });
        source.subscriptions[0].errorListener(new Error('socket closed'));
        assert.equal(value.snapshot().realtimeStatus, 'reconnecting');
        assert.equal(value.snapshot().reconnectAttempt, 1);
        assert.equal(value.snapshot().nextReconnectDelayMs, 100);
        assert.equal(scheduler.pending(), 1);

        scheduler.runNext();
        assert.equal(value.snapshot().realtimeStatus, 'reconnecting');
        assert.equal(value.snapshot().reconnectAttempt, 2);
        assert.equal(value.snapshot().nextReconnectDelayMs, 200);
        scheduler.runNext();
        assert.equal(value.snapshot().realtimeStatus, 'connected');
        assert.equal(value.snapshot().reconnectAttempt, 0);
        assert.equal(value.snapshot().nextReconnectDelayMs, null);
        assert.deepEqual(scheduler.delays, [100, 200]);
        assert.equal(source.resolveCalls.length, 1);
        assert.equal(source.barsCalls.length, 1);
        assert.equal(subscribeCalls, 3);
        assert.deepEqual(source.subscriptions[1].request, {
            symbol: 'AAPL', resolution: '1m',
        });
    });

    it('cancels a pending reconnect when the selection changes', async () => {
        const scheduler = schedulerDouble();
        const source = sourceDouble();
        const { value } = controller(source, seriesDouble(), {
            reconnectPolicy: { initialDelayMs: 100, jitterRatio: 0 },
            realtimeScheduler: scheduler.api,
        });
        await value.setSelection({ symbol: 'OLD', resolution: '1m' });
        source.subscriptions[0].errorListener(new Error('closed'));
        assert.equal(scheduler.pending(), 1);
        await value.setSelection({ symbol: 'NEW', resolution: '5m' });
        assert.equal(scheduler.pending(), 0);
        assert.equal(value.snapshot().selection.symbol, 'NEW');
        assert.equal(value.snapshot().realtimeStatus, 'connected');
        assert.equal(source.subscriptions.length, 2);
    });
});
