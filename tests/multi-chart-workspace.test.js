const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    MultiChartWorkspace,
    WorkspaceSyncErrorKind,
} = require('../src/workspace/multi-chart-workspace.js');

function documentDouble() {
    const document = {};
    document.createElement = () => elementDouble(document);
    return document;
}

function elementDouble(ownerDocument, initialStyle = {}) {
    const listeners = new Map();
    const classes = new Set();
    const element = {
        ownerDocument,
        style: {
            display: '',
            gridTemplateColumns: '',
            gridTemplateRows: '',
            gap: '',
            minWidth: '',
            minHeight: '',
            ...initialStyle,
        },
        dataset: {},
        children: [],
        parentElement: null,
        tabIndex: -1,
        classList: {
            add(value) { classes.add(value); },
            contains(value) { return classes.has(value); },
        },
        appendChild(child) {
            child.parentElement = this;
            this.children.push(child);
            return child;
        },
        remove() {
            if (this.parentElement !== null) {
                const index = this.parentElement.children.indexOf(this);
                if (index >= 0) this.parentElement.children.splice(index, 1);
                this.parentElement = null;
            }
        },
        addEventListener(type, listener) {
            let bucket = listeners.get(type);
            if (bucket === undefined) listeners.set(type, bucket = new Set());
            bucket.add(listener);
        },
        removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
        dispatch(type) {
            for (const listener of listeners.get(type) ?? []) listener({ type, target: this });
        },
        listenerCount(type) { return listeners.get(type)?.size ?? 0; },
    };
    return element;
}

function chartDouble(options = {}) {
    const rangeListeners = new Set();
    const crosshairListeners = new Set();
    let visibleRange = options.visibleRange ?? { from: 1, to: 2 };
    const rangeWrites = [];
    const crosshairWrites = [];
    let removeCount = 0;
    const timeScale = {
        getVisibleRange: () => visibleRange,
        setVisibleRange(range) {
            if (options.rangeError) throw options.rangeError;
            visibleRange = { ...range };
            rangeWrites.push(visibleRange);
            for (const listener of rangeListeners) listener(visibleRange);
        },
        subscribeVisibleTimeRangeChange(listener) { rangeListeners.add(listener); },
        unsubscribeVisibleTimeRangeChange(listener) { rangeListeners.delete(listener); },
    };
    const chart = {
        timeScale: () => timeScale,
        subscribeCrosshairMove(listener) { crosshairListeners.add(listener); },
        unsubscribeCrosshairMove(listener) { crosshairListeners.delete(listener); },
        setCrosshairPosition(position) {
            if (options.crosshairError) throw options.crosshairError;
            crosshairWrites.push({ kind: 'set', time: position.time });
            for (const listener of crosshairListeners) listener({ time: position.time });
        },
        clearCrosshairPosition() {
            if (options.crosshairError) throw options.crosshairError;
            crosshairWrites.push({ kind: 'clear' });
            for (const listener of crosshairListeners) listener({ time: null });
        },
        panes: () => Array.from({ length: options.internalPanes ?? 3 }, (_, index) => ({ index })),
        remove() { removeCount++; },
    };
    return {
        chart,
        rangeWrites,
        crosshairWrites,
        rangeListeners,
        crosshairListeners,
        emitRange(range) {
            visibleRange = range === null ? null : { ...range };
            for (const listener of rangeListeners) listener(visibleRange);
        },
        emitCrosshair(time) {
            for (const listener of crosshairListeners) listener({ time });
        },
        removeCount: () => removeCount,
    };
}

function selectionDouble(initial, options = {}) {
    const listeners = new Set();
    let selection = initial === null ? null : { ...initial };
    const writes = [];
    const data = {
        snapshot: () => ({ selection }),
        setSelection(next) {
            writes.push({ ...next });
            if (options.throwSelection) throw options.throwSelection;
            selection = { ...next };
            for (const listener of listeners) listener({ selection });
            if (options.rejectSelection) return Promise.reject(options.rejectSelection);
            return Promise.resolve();
        },
        subscribe(listener) { listeners.add(listener); },
        unsubscribe(listener) { listeners.delete(listener); },
    };
    return {
        data,
        writes,
        listeners,
        select(next) { return data.setSelection(next); },
        selection: () => selection,
    };
}

function workspaceDouble(options = {}) {
    const document = documentDouble();
    const originalStyle = {
        display: 'flex',
        gridTemplateColumns: 'original-columns',
        gridTemplateRows: 'original-rows',
        gap: '7px',
        minWidth: '10px',
        minHeight: '20px',
    };
    const container = elementDouble(document, originalStyle);
    const created = [];
    const workspace = new MultiChartWorkspace({
        container,
        count: options.count ?? 3,
        columns: options.columns,
        links: options.links,
        sync: options.sync,
        createChart(context) {
            const chart = chartDouble(options.chartOptions?.[context.index]);
            const data = selectionDouble(
                options.selections?.[context.index] ?? {
                    symbol: `S${context.index + 1}`,
                    resolution: `${context.index + 1}m`,
                },
                options.dataOptions?.[context.index],
            );
            const item = { context, chart, data };
            created.push(item);
            return { chart: chart.chart, data: data.data };
        },
    });
    return { workspace, container, created, originalStyle };
}

describe('MultiChartWorkspace', () => {
    it('owns only top-level chart cells and restores their full lifecycle', () => {
        const { workspace, container, created, originalStyle } = workspaceDouble({
            count: 4,
            columns: 2,
        });

        assert.deepEqual(workspace.snapshot(), {
            count: 4,
            columns: 2,
            rows: 2,
            activeId: 'workspace-chart-1',
            links: { symbol: false, resolution: false },
            sync: { range: false, crosshair: false },
            cells: workspace.cells(),
            errors: [],
        });
        assert.equal(created.every(item => item.chart.chart.panes().length === 3), true);
        assert.equal(workspace.snapshot().count, 4);
        assert.equal(container.children.length, 4);
        assert.equal(container.style.display, 'grid');
        assert.equal(container.style.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
        assert.equal(container.style.gridTemplateRows, 'repeat(2, minmax(0, 1fr))');
        assert.equal(container.children[2].dataset.sschartWorkspaceIndex, '2');
        assert.equal(container.children[2].classList.contains('sschart-workspace-cell'), true);

        container.children[2].dispatch('pointerdown');
        assert.equal(workspace.snapshot().activeId, 'workspace-chart-3');
        workspace.setLayout({ count: 3, columns: 1 });
        assert.equal(workspace.snapshot().rows, 3);
        assert.equal(created[3].chart.removeCount(), 1);
        workspace.setCount(2);
        assert.equal(created[2].chart.removeCount(), 1);

        const added = workspace.add('watchlist');
        assert.equal(added.id, 'watchlist');
        assert.equal(workspace.host('watchlist'), container.children[2]);
        assert.equal(workspace.chart('watchlist'), created[4].chart.chart);
        assert.throws(() => workspace.add('watchlist'), /duplicate workspace cell id/);
        assert.equal(workspace.remove('missing'), false);
        assert.equal(workspace.remove('watchlist'), true);
        assert.equal(workspace.remove('workspace-chart-2'), true);
        assert.throws(() => workspace.remove('workspace-chart-1'), /keep at least one chart/);

        const lastHost = container.children[0];
        assert.equal(lastHost.listenerCount('pointerdown'), 1);
        workspace.dispose();
        assert.equal(lastHost.listenerCount('pointerdown'), 0);
        assert.equal(created[0].chart.rangeListeners.size, 0);
        assert.equal(created[0].chart.crosshairListeners.size, 0);
        assert.equal(created[0].data.listeners.size, 0);
        assert.equal(created[0].chart.removeCount(), 1);
        assert.equal(container.children.length, 0);
        assert.deepEqual(container.style, originalStyle);
        assert.throws(() => workspace.snapshot(), /disposed/);
    });

    it('links symbol and resolution independently with the active chart as source', async () => {
        const { workspace, created } = workspaceDouble({
            selections: [
                { symbol: 'AAPL', resolution: '1m' },
                { symbol: 'MSFT', resolution: '5m' },
                { symbol: 'NVDA', resolution: '15m' },
            ],
        });

        await created[0].data.select({ symbol: 'GOOG', resolution: '1h' });
        assert.deepEqual(created[1].data.selection(), { symbol: 'MSFT', resolution: '5m' });
        workspace.setLinks({ symbol: true });
        assert.deepEqual(created[1].data.selection(), { symbol: 'GOOG', resolution: '5m' });
        assert.deepEqual(created[2].data.selection(), { symbol: 'GOOG', resolution: '15m' });

        await created[0].data.select({ symbol: 'TSLA', resolution: '4h' });
        assert.deepEqual(created[1].data.selection(), { symbol: 'TSLA', resolution: '5m' });
        assert.deepEqual(created[2].data.selection(), { symbol: 'TSLA', resolution: '15m' });

        workspace.setLinks({});
        await created[1].data.select({ symbol: 'MSFT', resolution: '30m' });
        workspace.setLinks({ resolution: true });
        assert.deepEqual(created[1].data.selection(), { symbol: 'MSFT', resolution: '4h' });
        assert.deepEqual(created[2].data.selection(), { symbol: 'TSLA', resolution: '4h' });

        workspace.setLinks({});
        await workspace.setSelection('workspace-chart-1', { symbol: 'AMD', resolution: '1d' });
        assert.deepEqual(created[0].data.selection(), { symbol: 'AMD', resolution: '1d' });
        assert.deepEqual(created[1].data.selection(), { symbol: 'MSFT', resolution: '4h' });
        workspace.activate('workspace-chart-2');
        workspace.setLinks({ symbol: true, resolution: true });
        assert.deepEqual(created[0].data.selection(), { symbol: 'MSFT', resolution: '4h' });
        assert.deepEqual(created[2].data.selection(), { symbol: 'MSFT', resolution: '4h' });
        assert.equal(workspace.snapshot().activeId, 'workspace-chart-2');

        workspace.dispose();
        assert.equal(created.every(item => item.data.listeners.size === 0), true);
    });

    it('optionally synchronizes absolute ranges and time-only crosshairs without loops', () => {
        const { workspace, created } = workspaceDouble();
        workspace.setSync({ range: true, crosshair: true });
        created.forEach(item => {
            item.chart.rangeWrites.length = 0;
            item.chart.crosshairWrites.length = 0;
        });

        created[0].chart.emitRange({ from: 10, to: 20 });
        assert.deepEqual(created[0].chart.rangeWrites, []);
        assert.deepEqual(created[1].chart.rangeWrites, [{ from: 10, to: 20 }]);
        assert.deepEqual(created[2].chart.rangeWrites, [{ from: 10, to: 20 }]);
        assert.equal(workspace.cells().every(cell => cell.visibleRange.from === 10), true);

        created[0].chart.emitCrosshair(15);
        assert.deepEqual(created[1].chart.crosshairWrites, [{ kind: 'set', time: 15 }]);
        assert.deepEqual(created[2].chart.crosshairWrites, [{ kind: 'set', time: 15 }]);
        assert.equal(workspace.cells().every(cell => cell.crosshairTime === 15), true);
        created[0].chart.emitCrosshair(null);
        assert.deepEqual(created[1].chart.crosshairWrites.at(-1), { kind: 'clear' });
        assert.deepEqual(created[2].chart.crosshairWrites.at(-1), { kind: 'clear' });

        const rangeWrites = created[1].chart.rangeWrites.length;
        const crosshairWrites = created[1].chart.crosshairWrites.length;
        workspace.setSync({});
        created[0].chart.emitRange({ from: 30, to: 40 });
        created[0].chart.emitCrosshair(35);
        assert.equal(created[1].chart.rangeWrites.length, rangeWrites);
        assert.equal(created[1].chart.crosshairWrites.length, crosshairWrites);
        workspace.dispose();
    });

    it('captures synchronization failures and rolls back a failed factory transaction', async () => {
        const selectionError = new Error('selection failed');
        const rangeError = new Error('range failed');
        const crosshairError = new Error('crosshair failed');
        const { workspace, created } = workspaceDouble({
            count: 2,
            dataOptions: [undefined, { throwSelection: selectionError }],
            chartOptions: [undefined, { rangeError, crosshairError }],
        });

        workspace.setLinks({ symbol: true });
        workspace.setSync({ range: true, crosshair: true });
        created[0].chart.emitRange({ from: 20, to: 30 });
        created[0].chart.emitCrosshair(25);
        assert.deepEqual(workspace.snapshot().errors.map(item => item.kind), [
            WorkspaceSyncErrorKind.Selection,
            WorkspaceSyncErrorKind.Range,
            WorkspaceSyncErrorKind.Crosshair,
        ]);
        workspace.clearErrors();
        assert.deepEqual(workspace.snapshot().errors, []);
        workspace.dispose();

        const document = documentDouble();
        const container = elementDouble(document, { display: 'block', gap: '4px' });
        const charts = [];
        assert.throws(() => new MultiChartWorkspace({
            container,
            count: 2,
            createChart({ index }) {
                const chart = chartDouble();
                charts.push(chart);
                return index === 0 ? { chart: chart.chart } : { chart: chart.chart, data: {} };
            },
        }), /invalid data controller/);
        assert.equal(container.children.length, 0);
        assert.equal(charts[0].removeCount(), 1);
        assert.equal(charts[1].removeCount(), 1);
        assert.equal(container.style.display, 'block');
        assert.equal(container.style.gap, '4px');
    });
});
