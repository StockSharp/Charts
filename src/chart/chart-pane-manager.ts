// Chart Pane Manager — multi-pane stacking with timeScale sync
import { IndicatorEngine } from './indicators/indicator-engine.js';
import { ChartLegend } from './chart-legend.js';
import { ChartContextMenu } from './chart-context-menu.js';

export class ChartPaneManager {
    _containerId: string;
    _mainContainer: HTMLElement | null;
    _panes: Map<string, any>;
    _nextId: number;
    _syncing: boolean;
    _mainChart: any;
    _wrapper: HTMLDivElement | null;
    _spineData: any[];
    _lastCandleCount: number;

    constructor(containerId) {
        this._containerId = containerId;
        this._mainContainer = null;
        this._panes = new Map(); // paneId -> { el, chart, label, spine }
        this._nextId = 1;
        this._syncing = false;
        this._mainChart = null;
        this._wrapper = null;
        this._spineData = []; // whitespace points [{ time }] mirroring main candle times
        this._lastCandleCount = 0;
    }

    init(mainChart) {
        this._mainChart = mainChart;
        const container = document.getElementById(this._containerId);
        if (!container) return;

        // Wrap chartContainer inside a flex column wrapper
        this._mainContainer = container.parentElement;

        // Create a wrapper that holds main chart + panes
        this._wrapper = document.createElement('div');
        this._wrapper.className = 'chart-panes-wrapper';
        this._wrapper.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;';

        // Move chartContainer into wrapper
        const chartEl = container;
        this._mainContainer!.insertBefore(this._wrapper, chartEl);
        this._wrapper.appendChild(chartEl);

        // The legend (#chartLegend) is position:absolute and was a sibling
        // of chartContainer at the chart-panel level. In multi-chart mode
        // we move the wrapper into multiChartGrid as one cell; the legend
        // would stay behind on chart-panel and span its full width,
        // overflowing into the neighbouring tiles. Relocate it inside the
        // wrapper so its absolute positioning resolves to the primary
        // tile's bounds and overflow:hidden on the wrapper clips it.
        const legendEl = document.getElementById('chartLegend');
        if (legendEl) this._wrapper.appendChild(legendEl);

        // Main chart takes flex: 3
        chartEl.style.flex = '3';
        chartEl.style.minHeight = '0';

        // Subscribe to main chart time scale for sync. Sync on the TIME axis,
        // not the bar-index (logical) axis: Renko / P&F keep the MAIN price
        // series on the raw candles while a pane's spine + indicators live on
        // fewer DERIVED bars (bricks / columns on synthetic times), so the two
        // index spaces have different bar counts and a logical range misaligns.
        // Time is the shared domain across the main chart and every pane.
        if (this._mainChart) {
            this._mainChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
                if (this._syncing || !range) return;
                this._syncing = true;
                for (const [, pane] of this._panes) {
                    try { pane.chart.timeScale().setVisibleRange(range); } catch (e) { }
                }
                this._syncing = false;
            });
        }

        window._chartPaneManager = this;
    }

    /// <summary>
    /// Returns an existing sub-pane whose stored `measure` tag matches, or
    /// null if none. Used by IndicatorEngine to stack RSI + Stochastic
    /// (both IndicatorMeasures.Percent) inside one 0..100 pane instead of
    /// opening a fresh pane per indicator.
    /// </summary>
    getPaneByMeasure(measure) {
        if (!measure) return null;
        for (const [paneId, pane] of this._panes) {
            if (pane.measure === measure) return paneId;
        }
        return null;
    }

    addPane(label, measure) {
        if (!this._wrapper) return null;
        const paneId = 'pane_' + (this._nextId++);

        // Create pane container
        const paneEl = document.createElement('div');
        paneEl.className = 'chart-sub-pane';
        paneEl.id = paneId;
        paneEl.style.cssText = 'flex:1;min-height:0;position:relative;border-top:1px solid #1e2633;';

        // Pane header — label on the left, live indicator values (with
        // per-indicator edit/× buttons) filled by ChartLegend on every tick.
        // No pane-wide close button: each indicator has its own ×, and the
        // pane auto-closes when the last one is removed.
        const header = document.createElement('div');
        header.className = 'chart-pane-header';
        header.innerHTML = `<span class="pane-label">${label}</span><span class="pane-values"></span>`;
        paneEl.appendChild(header);

        // Delegated click handler for the edit / remove buttons that
        // ChartLegend paints into .pane-values. Lives here (not on the
        // main legend) because these buttons sit outside chart-legend's
        // element, so its delegation wouldn't see them.
        header.addEventListener('click', (e) => {
            const engine = window._indicatorEngine;
            if (!engine) return;
            const tgt = e.target as Element | null;
            const rem = tgt?.closest('.legend-remove-btn') as HTMLElement | null;
            if (rem) {
                const id = parseInt(rem.dataset.indId!);
                if (!isNaN(id)) engine.remove(id);
                return;
            }
            const ed = tgt?.closest('.legend-edit-btn') as HTMLElement | null;
            if (ed) {
                const id = parseInt(ed.dataset.indId!);
                const type = ed.dataset.indType;
                if (!isNaN(id) && window.terminalApp?.openIndicatorEdit) {
                    window.terminalApp.openIndicatorEdit(id, type);
                }
            }
        });

        // Chart container
        const chartDiv = document.createElement('div');
        chartDiv.style.cssText = 'width:100%;height:calc(100% - 20px);';
        paneEl.appendChild(chartDiv);

        this._wrapper.appendChild(paneEl);

        // Create chart
        const chart = SSChart.createChart(chartDiv, {
            layout: {
                background: { type: 'solid', color: '#131820' },
                textColor: '#6b7a8d',
                fontFamily: "'IBM Plex Mono', 'Consolas', monospace",
                fontSize: 11,
                // v5 attribution badge is no longer rendered by sschart; toggle kept as a no-op for back-compat.
                attributionLogo: false,
            },
            grid: {
                vertLines: { color: 'rgba(30,38,51,0.4)' },
                horzLines: { color: 'rgba(30,38,51,0.4)' },
            },
            crosshair: {
                mode: SSChart.CrosshairMode.Normal,
                vertLine: { color: 'rgba(74,158,255,0.3)', labelBackgroundColor: '#4a9eff' },
                horzLine: { color: 'rgba(74,158,255,0.3)', labelBackgroundColor: '#4a9eff' },
            },
            rightPriceScale: {
                borderColor: '#1e2633',
                scaleMargins: { top: 0.1, bottom: 0.1 },
            },
            timeScale: {
                borderColor: '#1e2633',
                timeVisible: true,
                secondsVisible: false,
                visible: false, // hide time scale on sub-panes (only bottom pane shows it)
                ordinal: true,  // match the main chart's gap-collapsing axis so panes stay aligned
            },
            handleScroll: true,
            handleScale: true,
        });

        // Sync time scale by time (see the main-chart subscription above).
        chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
            if (this._syncing || !range) return;
            this._syncing = true;
            try { this._mainChart.timeScale().setVisibleRange(range); } catch (e) { }
            for (const [id, pane] of this._panes) {
                if (id === paneId) continue;
                try { pane.chart.timeScale().setVisibleRange(range); } catch (e) { }
            }
            this._syncing = false;
        });

        // Resize observer
        const ro = new ResizeObserver(() => {
            if (chart && chartDiv.clientWidth > 0) {
                chart.applyOptions({ width: chartDiv.clientWidth, height: chartDiv.clientHeight });
            }
        });
        ro.observe(chartDiv);

        // Legacy pane-wide close button is gone — each indicator in
        // .pane-values has its own × now, so removing one specific
        // indicator out of a shared pane is possible.

        // Hidden whitespace spine series keeps this pane's logical bar count aligned
        // with the main chart so synced visibleLogicalRange maps to the same time slots.
        const spine = chart.addSeries(SSChart.LineSeries, {
            color: 'rgba(0,0,0,0)',
            lineVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
        });

        // Same right-click menu as the main chart, but pane-scoped: add a study
        // into THIS pane, or remove the pane. No dedicated + button — the menu
        // is the consistent affordance across the main chart and every sub-pane.
        const ctxMenu = new ChartContextMenu();
        ctxMenu.init(chartDiv, null, {
            paneMode: true,
            onAddIndicator: () => window.terminalApp?.openIndicatorAddToPane?.(paneId),
            onRemovePane: () => {
                const eng = window._indicatorEngine;
                if (!eng) return;
                // Drop every study in this pane; the last removal auto-closes it.
                eng.getIndicators().filter((e) => e.paneId === paneId).forEach((e) => eng.remove(e.id));
            },
        });

        this._panes.set(paneId, { el: paneEl, chart, ro, label, spine, measure, ctxMenu });

        if (this._spineData.length) spine.setData(this._spineData);

        // Update bottom pane visibility
        this._updateTimeScaleVisibility();

        // Seed the new pane with the main chart's CURRENT time window (time,
        // not logical index) so a pane created while on Renko / P&F — or after a
        // realtime scroll — adopts exactly the main chart's visible span instead
        // of an incompatible bar-index range.
        if (this._mainChart) {
            try {
                const range = this._mainChart.timeScale().getVisibleRange();
                if (range) chart.timeScale().setVisibleRange(range);
            } catch (e) { }
        }

        return paneId;
    }

    removePane(paneId) {
        const pane = this._panes.get(paneId);
        if (!pane) return;

        pane.ro.disconnect();
        try { pane.ctxMenu?.dispose(); } catch { }
        pane.chart.remove();
        pane.el.remove();
        this._panes.delete(paneId);

        this._updateTimeScaleVisibility();
    }

    getChart(paneId) {
        const pane = this._panes.get(paneId);
        return pane ? pane.chart : null;
    }

    setSpineFromCandles(candles) {
        if (!candles || !candles.length) {
            this._spineData = [];
            this._lastCandleCount = 0;
            for (const [, pane] of this._panes) {
                if (pane.spine) { try { pane.spine.setData([]); } catch { } }
            }
            return;
        }
        // Build whitespace points — setData replaces fully (new points at end extend scale).
        this._spineData = candles.map(c => ({ time: c.time }));
        this._lastCandleCount = candles.length;
        for (const [, pane] of this._panes) {
            if (pane.spine) { try { pane.spine.setData(this._spineData); } catch { } }
        }
    }

    appendSpineCandle(candle) {
        if (!candle) return;
        const last = this._spineData.length ? this._spineData[this._spineData.length - 1] : null;
        if (last && last.time === candle.time) return; // unchanged time slot
        this._spineData.push({ time: candle.time });
        this._lastCandleCount = this._spineData.length;
        for (const [, pane] of this._panes) {
            if (pane.spine) { try { pane.spine.update({ time: candle.time }); } catch { } }
        }
    }

    setPaneTitle(paneId, label) {
        const pane = this._panes.get(paneId);
        if (!pane) return;
        const labelEl = pane.el.querySelector('.pane-label');
        if (labelEl) labelEl.textContent = label;
        pane.label = label;
    }

    /// <summary>
    /// Paints the values block in a sub-pane's header. Raw HTML — caller is
    /// responsible for escaping / coloring. Called from ChartLegend on every
    /// crosshair/price tick with the latest indicator values for this pane.
    /// </summary>
    setPaneValuesHtml(paneId, html) {
        const pane = this._panes.get(paneId);
        if (!pane) return;
        const el = pane.el.querySelector('.pane-values');
        if (el) el.innerHTML = html || '';
    }

    getPanes() {
        return Array.from(this._panes.keys());
    }

    resize() {
        for (const [, pane] of this._panes) {
            const chartDiv = pane.el.querySelector('div:last-child');
            if (chartDiv && pane.chart) {
                pane.chart.applyOptions({ width: chartDiv.clientWidth, height: chartDiv.clientHeight });
            }
        }
    }

    _updateTimeScaleVisibility() {
        // Show time scale only on the bottom-most pane (or main chart if no sub-panes)
        const paneIds = Array.from(this._panes.keys());

        if (paneIds.length === 0) {
            // No sub-panes: main chart shows time scale
            if (this._mainChart) {
                this._mainChart.applyOptions({ timeScale: { visible: true } });
            }
        } else {
            // Main chart hides time scale
            if (this._mainChart) {
                this._mainChart.applyOptions({ timeScale: { visible: false } });
            }
            // All panes hide except last
            for (let i = 0; i < paneIds.length; i++) {
                const pane = this._panes.get(paneIds[i]);
                const isLast = i === paneIds.length - 1;
                pane.chart.applyOptions({ timeScale: { visible: isLast } });
            }
        }
    }
}
