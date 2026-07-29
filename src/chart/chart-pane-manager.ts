// Compatibility adapter for the terminal UI. Pane rendering and scale
// ownership live in the chart engine; this class only keeps the historical
// pane-id lookup plus the terminal's HTML headers/context menus.
import type {
    ChartOptions,
    IChartApi,
    IPaneApi,
    ISeriesApi,
    PaneOptions,
    ResolvedPriceScaleOptions,
    SeriesDefinition,
    SeriesOptions,
    TimedSeriesData,
} from '../core/chart-api.js';
import { ChartContextMenu } from './chart-context-menu.js';

/** Layout patch an engine pane accepts — every pane option except its id. */
type PaneLayoutPatch = Omit<PaneOptions, 'id'>;
type PaneLayoutKey = keyof PaneLayoutPatch;

/**
 * What the old sub-chart callers pass to `applyOptions`: usually a whole
 * chart-option bag (the terminal's theme switch hands the same object to the
 * main chart and to every pane), which is why the scale members keep their
 * chart-wide shape. Only the pane's own layout keys and the pane-local scale
 * margins are read; every other key is ignored.
 */
interface LegacyPaneChartOptions
    extends PaneLayoutPatch, Pick<ChartOptions, 'rightPriceScale' | 'leftPriceScale'> {}

/**
 * Copies one layout key across. Key-generic because the compiler only keeps the
 * key and its value type correlated when both flow through the same type
 * parameter — indexing with a plain union of keys widens the write to `never`.
 */
function copyPaneLayoutOption<K extends PaneLayoutKey>(
    target: PaneLayoutPatch,
    source: LegacyPaneChartOptions,
    key: K,
): void {
    const value = source[key];
    if (value !== undefined) target[key] = value;
}

class LegacyPaneChartAdapter {
    constructor(
        private readonly owner: IChartApi,
        readonly nativePane: IPaneApi,
    ) {}

    addSeries<TData extends TimedSeriesData, TOptions extends SeriesOptions = SeriesOptions>(
        definition: SeriesDefinition<TData, TOptions>,
        options: Partial<TOptions> = {},
    ): ISeriesApi<TData, TOptions> {
        return this.nativePane.addSeries(definition, options);
    }
    adoptSeries(series: ISeriesApi) { return this.owner.moveSeries(series, this.nativePane); }
    removeSeries(series: ISeriesApi) { this.nativePane.removeSeries(series); }
    priceScale(scaleId = 'right') { return this.nativePane.priceScale(scaleId); }
    timeScale() { return this.owner.timeScale(); }
    series() { return this.nativePane.series(); }
    id() { return this.nativePane.id(); }
    getSize() { return this.nativePane.getSize(); }

    // Old callers used a sub-chart-shaped handle. Visual chart options are
    // already global on the owner; pane-local scale margins remain local.
    applyOptions(options: LegacyPaneChartOptions = {}) {
        const paneOptions: PaneLayoutPatch = {};
        for (const key of ['height', 'minHeight', 'order', 'state'] as const) {
            copyPaneLayoutOption(paneOptions, options, key);
        }
        if (Object.keys(paneOptions).length) this.nativePane.applyOptions(paneOptions);
        if (options.rightPriceScale?.scaleMargins) {
            this.nativePane.priceScale('right').applyOptions({
                scaleMargins: options.rightPriceScale.scaleMargins,
            });
        }
        if (options.leftPriceScale?.scaleMargins) {
            this.nativePane.priceScale('left').applyOptions({
                scaleMargins: options.leftPriceScale.scaleMargins,
            });
        }
    }

    takeScreenshot() { return this.owner.takeScreenshot(); }
}

/** A live pane: the engine's pane plus the terminal chrome mounted over it. */
interface PaneEntry {
    el: HTMLDivElement;
    chart: LegacyPaneChartAdapter;
    nativePane: IPaneApi;
    label: string;
    /** Indicator measure the pane is shared by, or null for a free-standing pane. */
    measure: string | null;
    ctxMenu: ChartContextMenu;
}

/** Layout of a just-removed pane, kept so restorePane() can rebuild it verbatim. */
interface PaneSnapshot {
    id: string;
    label: string;
    measure: string | null;
    paneOptions?: Required<PaneOptions>;
    rightPriceScale?: ResolvedPriceScaleOptions;
    leftPriceScale?: ResolvedPriceScaleOptions;
}

/**
 * The part of an indicator-engine entry this file reads. The engine itself is
 * reached through the shell-owned `window._indicatorEngine` handle (`any`), so
 * its list elements arrive untyped and are described here instead.
 */
interface IndicatorEntryRef {
    id: number;
    paneId: string | null;
}

/**
 * Terminal-UI chrome over the engine's native panes: HTML pane headers,
 * per-pane context menus, pane-id lookup and empty-pane restore. The engine
 * owns pane rendering and scales; this class only adds the terminal's DOM
 * headers/menus on top and never re-implements pane logic.
 */
export class ChartPaneManager {
    _containerId: string;
    _mainContainer: HTMLElement | null;
    _panes: Map<string, PaneEntry>;
    _removedPanes: Map<string, PaneSnapshot>;
    _nextId: number;
    _mainChart: IChartApi | null;
    _wrapper: HTMLDivElement | null;
    _resizeObserver: ResizeObserver | null;
    _headerSyncFrame: number | null;
    _onPointerMove: (() => void) | null;
    _onContextMenu: ((event: MouseEvent) => void) | null;

    constructor(containerId: string) {
        this._containerId = containerId;
        this._mainContainer = null;
        this._panes = new Map();
        this._removedPanes = new Map();
        this._nextId = 1;
        this._mainChart = null;
        this._wrapper = null;
        this._resizeObserver = null;
        this._headerSyncFrame = null;
        this._onPointerMove = null;
        this._onContextMenu = null;
    }

    // Nullable because the terminal can mount the chrome before (or without) a
    // chart — the guard below is what makes that a no-op rather than a crash.
    init(mainChart: IChartApi | null) {
        this._mainChart = mainChart;
        const chartEl = document.getElementById(this._containerId);
        if (!chartEl || !mainChart?.addPane) return;

        this._mainContainer = chartEl.parentElement;
        this._wrapper = document.createElement('div');
        this._wrapper.className = 'chart-panes-wrapper';
        this._wrapper.style.cssText = 'display:block;position:relative;width:100%;height:100%;overflow:hidden;';
        this._mainContainer?.insertBefore(this._wrapper, chartEl);
        this._wrapper.appendChild(chartEl);
        chartEl.style.position = 'absolute';
        chartEl.style.inset = '0';
        chartEl.style.width = '100%';
        chartEl.style.height = '100%';
        chartEl.style.minHeight = '0';

        const legendEl = document.getElementById('chartLegend');
        if (legendEl) this._wrapper.appendChild(legendEl);

        this._onPointerMove = () => this._scheduleHeaderSync();
        chartEl.addEventListener('pointermove', this._onPointerMove);
        chartEl.addEventListener('pointerup', this._onPointerMove);
        this._resizeObserver = new ResizeObserver(() => this._scheduleHeaderSync());
        this._resizeObserver.observe(chartEl);

        // Route a right-click in an indicator pane to that pane's legacy
        // menu before the main-chart menu sees the same shared canvas event.
        this._onContextMenu = (event) => {
            const rect = chartEl.getBoundingClientRect();
            const y = event.clientY - rect.top;
            for (const [, pane] of this._panes) {
                const size = pane.nativePane.getSize();
                if (y < size.top || y > size.top + size.height) continue;
                event.stopImmediatePropagation();
                pane.ctxMenu?._handleContextMenu(event);
                return;
            }
        };
        chartEl.addEventListener('contextmenu', this._onContextMenu, true);

        window._chartPaneManager = this;
    }

    getPaneByMeasure(measure: string | null) {
        if (!measure) return null;
        for (const [paneId, pane] of this._panes) {
            if (pane.measure === measure) return paneId;
        }
        return null;
    }

    addPane(label: string, measure: string | null, restoration: PaneSnapshot | null = null) {
        if (!this._wrapper || !this._mainChart?.addPane) return null;
        let paneId = restoration?.id;
        if (paneId !== undefined
            && (typeof paneId !== 'string' || paneId.trim().length === 0 || this._panes.has(paneId))) {
            throw new Error(`sschart: pane '${String(paneId)}' cannot be restored`);
        }
        if (paneId === undefined) {
            do { paneId = 'pane_' + this._nextId++; } while (this._panes.has(paneId));
        }
        const restoredOptions: PaneOptions = restoration?.paneOptions || {};
        const nativePane = this._mainChart.addPane({
            id: paneId,
            height: restoredOptions.height ?? 160,
            minHeight: restoredOptions.minHeight ?? 64,
            order: restoredOptions.order ?? this._panes.size + 1,
            state: restoredOptions.state ?? 'normal',
        });
        nativePane.priceScale('right').applyOptions(
            restoration?.rightPriceScale || { scaleMargins: { top: 0.1, bottom: 0.1 } },
        );
        if (restoration?.leftPriceScale)
            nativePane.priceScale('left').applyOptions(restoration.leftPriceScale);
        const chart = new LegacyPaneChartAdapter(this._mainChart, nativePane);

        const paneEl = document.createElement('div');
        paneEl.className = 'chart-sub-pane chart-sub-pane-native';
        paneEl.id = paneId;
        paneEl.style.cssText = 'position:absolute;left:0;right:0;z-index:4;pointer-events:none;';

        const header = document.createElement('div');
        header.className = 'chart-pane-header';
        header.style.pointerEvents = 'auto';
        header.innerHTML = `<span class="pane-label">${label}</span><span class="pane-values"></span>`;
        paneEl.appendChild(header);
        this._wrapper.appendChild(paneEl);

        header.addEventListener('click', (event) => {
            const engine = window._indicatorEngine;
            if (!engine) return;
            const target = event.target as Element | null;
            const remove = target?.closest('.legend-remove-btn') as HTMLElement | null;
            if (remove) {
                const id = parseInt(remove.dataset.indId!);
                if (!isNaN(id)) engine.remove(id);
                return;
            }
            const edit = target?.closest('.legend-edit-btn') as HTMLElement | null;
            if (edit) {
                const id = parseInt(edit.dataset.indId!);
                const type = edit.dataset.indType;
                if (!isNaN(id) && window.terminalApp?.openIndicatorEdit)
                    window.terminalApp.openIndicatorEdit(id, type);
            }
        });

        const ctxMenu = new ChartContextMenu();
        ctxMenu.init(header, null, {
            paneMode: true,
            onAddIndicator: () => window.terminalApp?.openIndicatorAddToPane?.(paneId),
            onRemovePane: () => {
                const engine = window._indicatorEngine;
                if (!engine) return;
                engine.getIndicators().filter((entry: IndicatorEntryRef) => entry.paneId === paneId)
                    .forEach((entry: IndicatorEntryRef) => engine.remove(entry.id));
            },
        });

        this._panes.set(paneId, {
            el: paneEl,
            chart,
            nativePane,
            label,
            measure,
            ctxMenu,
        });
        this._removedPanes.delete(paneId);
        this._scheduleHeaderSync();
        return paneId;
    }

    removePane(paneId: string) {
        const pane = this._panes.get(paneId);
        if (!pane) return;
        const scaleIds = pane.nativePane.priceScaleIds?.() || [];
        this._removedPanes.set(paneId, {
            id: paneId,
            label: pane.label,
            measure: pane.measure,
            paneOptions: pane.nativePane.options?.(),
            rightPriceScale: pane.nativePane.priceScale('right').options?.(),
            leftPriceScale: scaleIds.includes('left')
                ? pane.nativePane.priceScale('left').options?.()
                : undefined,
        });
        try { pane.ctxMenu?.dispose(); } catch { /* keep releasing */ }
        // A pane can only be in the map when addPane() ran, and that returns
        // early unless init() stored the chart — so the handle is set here.
        try { this._mainChart!.removePane(pane.nativePane); } catch { /* already removed */ }
        pane.el.remove();
        this._panes.delete(paneId);
        this._scheduleHeaderSync();
    }

    /** Recreates a recently emptied pane with the same native id and layout options. */
    restorePane(paneId: string) {
        const snapshot = this._removedPanes.get(paneId);
        if (!snapshot) return null;
        return this.addPane(snapshot.label, snapshot.measure, snapshot);
    }

    getChart(paneId: string) {
        return this._panes.get(paneId)?.chart ?? null;
    }

    setPaneTitle(paneId: string, label: string) {
        const pane = this._panes.get(paneId);
        if (!pane) return;
        const labelEl = pane.el.querySelector('.pane-label');
        if (labelEl) labelEl.textContent = label;
        pane.label = label;
    }

    setPaneValuesHtml(paneId: string, html: string) {
        const pane = this._panes.get(paneId);
        if (!pane) return;
        const values = pane.el.querySelector('.pane-values');
        if (values) values.innerHTML = html || '';
    }

    getPanes() { return Array.from(this._panes.keys()); }
    resize() { this._scheduleHeaderSync(); }

    _scheduleHeaderSync() {
        if (this._headerSyncFrame !== null) return;
        this._headerSyncFrame = requestAnimationFrame(() => {
            this._headerSyncFrame = null;
            this._syncHeaders();
        });
    }

    _syncHeaders() {
        for (const [, pane] of this._panes) {
            const size = pane.nativePane.getSize();
            pane.el.style.top = `${size.top}px`;
            pane.el.style.height = `${Math.min(20, size.height)}px`;
            pane.el.style.display = size.height > 0 ? 'block' : 'none';
        }
    }

    dispose() {
        for (const paneId of Array.from(this._panes.keys())) this.removePane(paneId);
        this._removedPanes.clear();
        const chartEl = document.getElementById(this._containerId);
        if (chartEl && this._onPointerMove) {
            chartEl.removeEventListener('pointermove', this._onPointerMove);
            chartEl.removeEventListener('pointerup', this._onPointerMove);
        }
        if (chartEl && this._onContextMenu)
            chartEl.removeEventListener('contextmenu', this._onContextMenu, true);
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        if (this._headerSyncFrame !== null) cancelAnimationFrame(this._headerSyncFrame);
        this._headerSyncFrame = null;
        this._onPointerMove = null;
        this._onContextMenu = null;
    }
}
