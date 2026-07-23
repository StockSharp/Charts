// Indicator Engine — client-side compute over the live candle stream.
// Every executable study uses IndicatorRuntime and emits tail patches. Batch
// calculators remain independent numeric oracles and are never a render fallback.
// Engine drives add/remove/render lifecycle and keeps the legend on the exact
// same targetIndex model as the rendered series.
//
// No server round-trip, no wsClient.subscribeIndicator. Old `subId` field is
// kept on the entry object purely as a legacy placeholder — nothing reads it
// anymore. Live updates: terminal-app shares the chart's raw-candle array with
// the engine via setCandles (same reference), and chart.updatePrice mutates
// that array in place on every tick, then fires chart.onLiveBarUpdate →
// engine.onLiveUpdate(). One animation-frame pass advances incremental entries.
// The standalone
// appendCandle() path below stays available for callers that hand the engine
// its OWN candle array instead of sharing the chart's.
import { IndicatorSettings } from './indicator-settings.js';
import { IndicatorRenderer } from './indicator-renderer.js';
import {
    applyIndicatorStyles,
    captureIndicatorStyles,
} from './indicator-styles.js';
import {
    IndicatorRuntime,
    getIndicatorDefinition,
    type IndicatorRuntimePatch,
} from '../../indicators/index.js';

export class IndicatorEngine {
    _indicators: any[];
    _nextId: number;
    _renderer: any;
    _paneManager: any;
    _wsClient: any;
    _symbol: any;
    _timeframe: any;
    _subIdToEntry: Map<any, any>;
    _candles: any[];
    onChange: (() => void) | null;
    _renderPending: boolean | undefined;
    _retainRuntimeHistory: boolean;
    // Open time of the last candle already reflected in the sub-pane spine.
    // Lets onLiveUpdate extend the spine exactly once per new bar without a
    // full spine rebuild on every intra-bar tick.
    _lastSpineTime: any;
    _lastSpineCount: number;

    /// Drop warm-up points where `value` is not a finite number. Operates on
    /// either a flat `[{time,value}]` series (single-output indicators like SMA)
    /// or a `{key1:[...], key2:[...]}` object (multi-output like MACD/BB).
    /// Returns the same shape with nulls removed.
    static _stripNulls(data) {
        const keep = (p: any) => p && typeof p.value === 'number' && Number.isFinite(p.value);
        if (Array.isArray(data)) return data.filter(keep);
        if (data && typeof data === 'object') {
            const out: Record<string, any> = {};
            for (const k of Object.keys(data)) {
                const v = data[k];
                out[k] = Array.isArray(v) ? v.filter(keep) : v;
            }
            return out;
        }
        return data;
    }

    constructor() {
        this._indicators = []; // { id, persistenceId, type, params, seriesRefs[], paneId, outputNames[] }
        this._nextId = 1;
        this._renderer = null;
        this._paneManager = null;
        this._wsClient = null;
        this._symbol = null;
        this._timeframe = null;
        this._subIdToEntry = new Map();
        this._candles = [];
        this._retainRuntimeHistory = false;
        this._lastSpineCount = 0;
        this.onChange = null;
    }

    setRenderer(renderer) { this._renderer = renderer; }
    setPaneManager(paneManager) { this._paneManager = paneManager; }

    setWsClient(wsClient) {
        // wsClient is no longer the indicator source — calc runs locally. Kept
        // as a setter for API compatibility; engine still inspects it on add()
        // to gate behaviour while the chart is still booting (no candles yet).
        this._wsClient = wsClient;
    }

    setSymbol(symbol) { this._symbol = symbol; }
    setTimeframe(timeframe) { this._timeframe = timeframe; }

    // Keep the raw candle window as the source for incremental runtime reseeds
    // and shifted sparse timestamps. The same data
    // also drives the invisible pane spine.
    setCandles(candles, options: { rewindableTail?: boolean } = {}) {
        this._candles = candles || [];
        this._retainRuntimeHistory = options.rewindableTail === true;
        if (this._paneManager) this._paneManager.setSpineFromCandles(this._candles);
        this._lastSpineTime = this._candles.length ? this._candles[this._candles.length - 1].time : null;
        this._lastSpineCount = this._candles.length;
        // Re-render every active indicator against the fresh candle window.
        // This fires on symbol switch / timeframe change after the chart
        // pulled new candles via api.getCandles.
        for (const entry of this._indicators) this._resetIncrementalAndRender(entry);
    }

    /// Live-tick update. terminal-app shares the chart's raw-candle array
    /// with the engine (setCandles stores that same reference), and
    /// chart.updatePrice mutates it in place — updating the last bar or pushing
    /// a new one — before firing chart.onLiveBarUpdate. So the candle window is
    /// already current here; we must NOT push again (that would duplicate the
    /// bar). We only (a) extend the sub-pane spine once per genuinely new bar so
    /// separate-pane indicators keep an x-slot for it, and (b) schedule a
    /// coalesced incremental update+render so overlays (SMA/EMA/BB) and sub-pane
    /// indicators track the moving bar and new bars instead of freezing on the
    /// initial snapshot. Migrated entries produce one tail patch here.
    onLiveUpdate() {
        const count = this._candles.length;
        const last = count > 0 ? this._candles[count - 1] : null;
        if (this._paneManager) {
            try {
                if (count < this._lastSpineCount
                    || (count === this._lastSpineCount
                        && (last?.time ?? null) !== this._lastSpineTime)) {
                    this._paneManager.setSpineFromCandles(this._candles);
                } else if (count > this._lastSpineCount) {
                    for (let index = this._lastSpineCount; index < count; index++)
                        this._paneManager.appendSpineCandle(this._candles[index]);
                }
            } catch { /* pane torn down */ }
        }
        this._lastSpineTime = last?.time ?? null;
        this._lastSpineCount = count;
        this._scheduleRender();
    }

    appendCandle(candle) {
        if (!this._candles.length) return;
        const last = this._candles[this._candles.length - 1];
        const isNewBar = last.time !== candle.time;
        if (isNewBar) {
            this._candles.push(candle);
            if (this._paneManager) this._paneManager.appendSpineCandle(candle);
        } else {
            this._candles[this._candles.length - 1] = candle;
        }
        this._lastSpineTime = candle.time;
        this._lastSpineCount = this._candles.length;
        // Live processing, coalesced per animation frame. Alpaca crypto bursts
        // through 50-200 ticks/sec; calling renderer.setData (which rebuilds
        // every chart series internally) that often makes the
        // chart visibly flicker, the legend rows shimmer, and the edit/×
        // buttons impossible to click — mouseup lands on a freshly-painted
        // canvas. RAF gates us to one repaint per frame (~60fps) without
        // changing arithmetic correctness — last call wins.
        this._scheduleRender();
    }

    /// Coalesce a render burst into a single rAF callback. Repeated forming-bar
    /// notifications collapse to one preview calculation.
    _scheduleRender() {
        if (this._renderPending) return;
        this._renderPending = true;
        const run = () => {
            this._renderPending = false;
            for (const entry of this._indicators) this._updateIncrementalAndRender(entry);
        };
        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
            window.requestAnimationFrame(run);
        } else {
            // Node / tests path: setTimeout(0). Keeps test semantics — call
            // returns synchronously, the update happens on the next task.
            setTimeout(run, 0);
        }
    }

    // targetPaneId is a genuinely optional placement hint: when the user adds an
    // indicator via a sub-pane's ＋ button it names the pane to drop into; when
    // omitted, placement is automatic (overlay on the main chart, or a measure-
    // resolved sub-pane). Absent = auto is a legitimate default, so this stays
    // optional rather than threaded through every existing call site.
    add(
        type,
        params,
        targetPaneId?,
        persistence: { persistenceId?: string } = {},
    ) {
        if (persistence === null || typeof persistence !== 'object' || Array.isArray(persistence))
            throw new TypeError('sschart: indicator persistence options must be an object');
        const requestedPersistenceId = persistence.persistenceId;
        if (requestedPersistenceId !== undefined
            && (typeof requestedPersistenceId !== 'string'
                || requestedPersistenceId.trim().length === 0)) {
            throw new TypeError('sschart: indicator persistence id must be a non-empty string');
        }
        const normalizedPersistenceId = requestedPersistenceId?.trim();
        if (normalizedPersistenceId !== undefined
            && this._indicators.some(entry => entry.persistenceId === normalizedPersistenceId)) {
            throw new Error(`sschart: duplicate indicator persistence id '${normalizedPersistenceId}'`);
        }
        const settings = IndicatorSettings.getIndicator(type);
        if (!settings) return null;

        const definition = getIndicatorDefinition(settings.serverKind || type)
            || getIndicatorDefinition(type);
        if (!definition) {
            console.warn('[Indicators] no incremental runtime for', type, '— skipping');
            return null;
        }

        const id = this._nextId++;
        const persistenceId = normalizedPersistenceId || `indicator-${id}`;
        const mergedParams = this._mergeParams(settings, params);
        let runtime;
        try {
            runtime = new IndicatorRuntime({
                definition,
                parameters: mergedParams,
                // The engine already owns the candle window. Final bars are
                // immutable by convention; only the separate preview tail is mutated.
                snapshotInput: (value) => value,
            } as any);
        } catch (err) {
            console.error('[Indicators] incremental runtime init failed for', type, err);
            return null;
        }
        const entry = {
            id, persistenceId, type,
            params: mergedParams,
            seriesRefs: [], paneId: null, colors: [], outputNames: [], legendSources: {},
            definition, runtime,
            _runtimeFirstTime: null,
            _runtimePreviewTime: null,
            // Per-indicator price scale inside a sub-pane; 'right' (the visible axis) by default,
            // reassigned below for the 2nd+ indicator in a pane. Declared here so the type carries it.
            paneScaleId: 'right',
        };

        // Explicit user placement from the picker's pane selector (or a sub-pane's
        // context menu) wins over automatic placement:
        //   '__main__' -> overlay on the main chart, '__new__' -> a fresh pane,
        //   '<paneId>' -> that existing pane. Absent -> automatic (overlay vs a
        //   measure-resolved sub-pane).
        if (targetPaneId === '__main__') {
            entry.paneId = null;
        } else if (targetPaneId === '__new__' && this._paneManager) {
            const label = settings.name + ' (' + this._formatParams(mergedParams) + ')';
            entry.paneId = this._paneManager.addPane(label, null);
        } else if (targetPaneId && this._paneManager && this._paneManager.getChart(targetPaneId)) {
            entry.paneId = targetPaneId;
        } else if (settings.pane === 'separate' && this._paneManager) {
            entry.paneId = this._resolveSubPane(settings, mergedParams);
        }

        // Per-indicator price scale inside a sub-pane. The first indicator in a
        // pane keeps the visible 'right' axis; every later one gets its own
        // scale so studies with different value ranges (RSI 0..100 vs MACD
        // -2..+2) each auto-fit and overlay instead of squashing on one shared
        // scale — the multi-axis-per-area model the C# chart uses.
        if (entry.paneId) {
            const firstInPane = !this._indicators.some(e => e.paneId === entry.paneId);
            entry.paneScaleId = firstInPane ? 'right' : `indicator:${persistenceId}`;
        }

        this._indicators.push(entry);
        this._resetIncrementalAndRender(entry);

        if (this.onChange) this.onChange();
        return entry;
    }

    _renderData(entry, data) {
        const settings = IndicatorSettings.getIndicator(entry.type);
        const chart = entry.paneId ? this._paneManager.getChart(entry.paneId) : null;
        if (!entry.seriesRefs.length) {
            entry.seriesRefs = this._renderer.render(entry, data, chart, settings) || [];
            entry.colors = this._renderer.getLastColors();
            this._applyPaneScale(entry, chart);
        } else {
            try { this._renderer.update(entry, data, chart, settings); }
            catch (err) { console.warn('[Indicators] update failed for', entry.type, err); }
        }
    }

    _resetIncrementalAndRender(entry) {
        const runtime = entry.runtime;
        if (!runtime) return;
        try {
            const inputs = new Array(this._candles.length > 0 ? this._candles.length - 1 : 0);
            for (let index = 0; index < inputs.length; index++) {
                inputs[index] = this._runtimeInput(this._candles[index]);
            }
            const preview = this._candles.length > 0
                ? this._runtimeInput(this._candles[this._candles.length - 1])
                : undefined;
            let points;
            if (this._retainRuntimeHistory) {
                runtime.reset(inputs);
                if (preview !== undefined) runtime.update(preview, false);
                points = runtime.points();
            } else {
                points = runtime.resetStreaming(inputs, preview);
            }
            entry.outputNames = runtime.outputs.map((output) => output.id);
            this._renderData(entry, this._runtimeRendererShape(entry, points));
            this._renderer.prepareRuntime(entry, runtime, points);
            this._syncRuntimeLegend(entry, points);
            entry._runtimeFirstTime = this._candles.length
                ? this._toSec(this._candles[0].time)
                : null;
            entry._runtimePreviewTime = this._candles.length
                ? this._toSec(this._candles[this._candles.length - 1].time)
                : null;
        } catch (err) {
            console.error('[Indicators] incremental reset failed for', entry.type, err);
        }
    }

    _updateIncrementalAndRender(entry) {
        const runtime = entry.runtime;
        if (!runtime) return;
        let patchFailed = false;
        const apply = (patch: IndicatorRuntimePatch) => {
            if (this._applyRuntimePatch(entry, patch)) return;
            patchFailed = true;
            throw new Error('indicator painter rejected a runtime tail patch');
        };
        try {
            if (!this._candles.length) {
                if (!this._retainRuntimeHistory) {
                    this._resetIncrementalAndRender(entry);
                    return;
                }
                if (runtime.hasPreview) apply(runtime.discardPreview());
                while (runtime.committedCount > 0) apply(runtime.truncateTail());
                entry._runtimeFirstTime = null;
                entry._runtimePreviewTime = null;
            } else {
                const firstTime = this._toSec(this._candles[0].time);
                let logicalCount = runtime.committedCount + (runtime.hasPreview ? 1 : 0);
                if ((entry._runtimeFirstTime !== null && entry._runtimeFirstTime !== firstTime)
                    || (!this._retainRuntimeHistory && logicalCount > this._candles.length)) {
                    this._resetIncrementalAndRender(entry);
                    return;
                }

                if (this._retainRuntimeHistory && logicalCount > this._candles.length) {
                    if (runtime.hasPreview) apply(runtime.discardPreview());
                    const desiredCommitted = Math.max(0, this._candles.length - 1);
                    while (runtime.committedCount > desiredCommitted)
                        apply(runtime.truncateTail());
                    logicalCount = runtime.committedCount;
                }

                if (runtime.hasPreview) {
                    const previewIndex = runtime.committedCount;
                    const previewCandle = this._candles[previewIndex];
                    if (!previewCandle
                        || entry._runtimePreviewTime !== this._toSec(previewCandle.time)) {
                        this._resetIncrementalAndRender(entry);
                        return;
                    }
                    if (logicalCount < this._candles.length)
                        apply(runtime.update(this._runtimeInput(previewCandle), true));
                }

                while (runtime.committedCount < this._candles.length - 1) {
                    apply(runtime.update(
                        this._runtimeInput(this._candles[runtime.committedCount]),
                        true,
                    ));
                }

                const last = this._candles[this._candles.length - 1];
                if (!runtime.hasPreview) {
                    apply(runtime.update(this._runtimeInput(last), false));
                } else if (runtime.committedCount + 1 === this._candles.length) {
                    apply(runtime.update(this._runtimeInput(last), false));
                }
                entry._runtimeFirstTime = firstTime;
                entry._runtimePreviewTime = this._toSec(last.time);
            }
        } catch (err) {
            if (!patchFailed)
                console.error('[Indicators] incremental update failed for', entry.type, err);
            this._resetIncrementalAndRender(entry);
            return;
        }
        if (!this._retainRuntimeHistory) runtime.compactHistory();
    }

    _applyRuntimePatch(entry, patch) {
        let applied = false;
        try { applied = this._renderer.updateRuntime(entry, patch, entry.runtime); }
        catch (err) { console.warn('[Indicators] runtime painter update failed for', entry.type, err); }
        if (!applied) return false;
        return this._applyRuntimeLegendPatch(entry, patch);
    }

    _runtimeInput(candle) {
        return { time: this._toSec(candle.time), value: candle };
    }

    _runtimeRendererShape(entry, points = entry.runtime.points()) {
        const data: Record<string, any[]> = {};
        for (const output of entry.outputNames) data[output] = [];
        for (const point of points) {
            const output = data[point.outputId];
            if (output && point.time !== null)
                output.push({ ...point.metadata, time: point.time, value: point.value });
        }
        return data;
    }

    _syncRuntimeLegend(entry, points = entry.runtime.points()) {
        if (entry.outputNames.length === 1) {
            const outputId = entry.outputNames[0];
            entry._points = [];
            entry._runtimeLegendTailTargets = [];
            for (const point of points) {
                if (point.outputId !== outputId || point.time === null) continue;
                entry._points.push({ time: point.time, values: { [outputId]: point.value } });
                entry._runtimeLegendTailTargets.push(point.targetIndex);
            }
            entry._lastValues = entry._points.length
                ? entry._points[entry._points.length - 1].values
                : null;
            return;
        }

        const byTarget = new Map<number, { time: number; values: Record<string, number> }>();
        for (const point of points) {
            if (point.time === null) continue;
            let row = byTarget.get(point.targetIndex);
            if (!row) {
                row = { time: point.time, values: {} };
                byTarget.set(point.targetIndex, row);
            }
            row.time = point.time;
            row.values[point.outputId] = point.value;
        }
        const ordered = [...byTarget.entries()].sort((left, right) => left[0] - right[0]);
        entry._points = ordered.map(([, row]) => ({ time: row.time, values: row.values }));
        entry._runtimeLegendTailTargets = ordered.map(([targetIndex]) => targetIndex);
        entry._lastValues = entry._points.length
            ? entry._points[entry._points.length - 1].values
            : null;
    }

    _applyRuntimeLegendPatch(entry, patch) {
        const points = entry._points || (entry._points = []);
        const targets = entry._runtimeLegendTailTargets
            || (entry._runtimeLegendTailTargets = []);
        for (const operation of patch.operations) {
            const lastIndex = points.length - 1;
            const lastTarget = targets.length ? targets[targets.length - 1] : -1;
            if (operation.operation === 'remove') {
                if (operation.targetIndex !== lastTarget || lastIndex < 0) return false;
                const current = points[lastIndex];
                const values = { ...current.values };
                delete values[operation.outputId];
                if (Object.keys(values).length > 0) {
                    points[lastIndex] = { time: current.time, values };
                } else {
                    points.pop();
                    targets.pop();
                }
                continue;
            }

            const point = operation.point;
            if (!point || point.time === null) return false;
            if (point.targetIndex === lastTarget && lastIndex >= 0) {
                const current = points[lastIndex];
                if (current.time !== point.time) return false;
                points[lastIndex] = {
                    time: point.time,
                    values: { ...current.values, [point.outputId]: point.value },
                };
            } else {
                if (point.targetIndex <= lastTarget) return false;
                points.push({ time: point.time, values: { [point.outputId]: point.value } });
                targets.push(point.targetIndex);
            }
        }
        entry._lastValues = points.length ? points[points.length - 1].values : null;
        return true;
    }

    /// Route an indicator's series onto its own sub-pane scale (see add()). The
    /// first indicator in a pane stays on 'right' (the visible axis, drawn by the
    /// engine); every later one moves to a private scale that auto-fits its own
    /// range, with the same margins so each study uses the full pane height. The
    /// engine draws axes only for 'right'/'left', so these extra scales stay
    /// invisible — they exist purely to keep the overlays from squashing.
    _applyPaneScale(entry, chart) {
        const sid = entry.paneScaleId;
        if (!chart || !sid || sid === 'right') return;
        for (const s of entry.seriesRefs) {
            try { s.applyOptions({ priceScaleId: sid }); } catch { }
        }
        try { chart.priceScale(sid).applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } }); } catch { }
    }

    /// Materialise a `[{time, values:{k:v, ...}}]` table from the calc output
    /// so the legend can read all outputs at a given bar in O(log N) (binary
    /// search by time). Time is converted to seconds-since-epoch — matches
    /// what the chart runtime and our chart-widget already use.
    _buildLegendPoints(entry, data) {
        const out: any[] = [];
        if (Array.isArray(data)) {
            for (const p of data) {
                if (p.value == null) continue;
                out.push({ time: this._toSec(p.time), values: { value: Number(p.value) } });
            }
        } else {
            const keys = Object.keys(data);
            // Merge by timestamp, not array index. After null stripping sparse
            // outputs (Fractals up/down) have different lengths and timestamps.
            const byTime = new Map<number, Record<string, number>>();
            for (const key of keys) {
                for (const point of data[key] || []) {
                    if (point?.value == null) continue;
                    const time = this._toSec(point.time);
                    let values = byTime.get(time);
                    if (!values) byTime.set(time, values = {});
                    values[key] = Number(point.value);
                }
            }
            for (const [time, values] of byTime) out.push({ time, values });
            out.sort((a, b) => a.time - b.time);
        }
        return out;
    }

    _toSec(time) {
        if (typeof time === 'number') return time;
        const p = Date.parse(time);
        return isFinite(p) ? Math.floor(p / 1000) : 0;
    }

    remove(id) {
        const idx = this._indicators.findIndex(e => e.id === id);
        if (idx < 0) return;
        const entry = this._indicators[idx];
        this._removeEntry(entry);
        if (this.onChange) this.onChange();
    }

    _removeEntry(entry) {
        // The painter may own resources in addition to its returned series, so
        // let the renderer notify it before removing the chart primitives.
        if (this._renderer) this._renderer.removeSeries(entry);
        const i = this._indicators.indexOf(entry);
        if (i >= 0) this._indicators.splice(i, 1);
        // Close the sub-pane only if no other active indicator is drawing
        // into it — multiple Percent-scale indicators (RSI + Stochastic,
        // etc.) now share one pane, so we must not drop it while siblings
        // are still rendering.
        if (entry.paneId && this._paneManager) {
            const stillUsed = this._indicators.some(e => e.paneId === entry.paneId);
            if (!stillUsed) {
                try { this._paneManager.removePane(entry.paneId); } catch { }
            }
        }
    }

    removeAll() {
        const entries = this._indicators.slice();
        for (const entry of entries) this.remove(entry.id);
    }

    // Re-seeds every active local runtime after a timeframe/source change.
    // Series identity, pane placement, persistence ids and user styles stay intact.
    async resubscribeAll() {
        for (const entry of this._indicators) this._resetIncrementalAndRender(entry);
    }

    // Called by indicator-dialog's edit-save path: keep the row but re-fetch
    // history with updated parameters. Simplest correct path is to drop the
    // old subscription and add a fresh one with the same type — the server
    // keys each IIndicator instance per subscription so new params mean new
    // compute state anyway.
    async replaceParams(id, newParams) {
        const idx = this._indicators.findIndex(e => e.id === id);
        if (idx < 0) return;
        const entry = this._indicators[idx];
        const type = entry.type;
        const settings = IndicatorSettings.getIndicator(type);
        const merged = this._mergeParams(settings, { ...entry.params, ...newParams });
        const styles = captureIndicatorStyles(entry);
        const targetPaneId = entry.paneId || '__main__';
        const persistenceId = entry.persistenceId;
        this.remove(id);
        const replacement = this.add(type, merged, targetPaneId, { persistenceId });
        if (replacement) applyIndicatorStyles(replacement, styles);
        return replacement;
    }

    getIndicators() { return this._indicators.slice(); }

    // Called by chart-legend on crosshair hover. A supplied `time` means the
    // value must belong to that exact candle. Carrying the previous value
    // forward is wrong for sparse studies (Fractals, pivots, signals): it makes
    // the legend describe a marker from another bar. Without a hover time we
    // still show the most recently formed value.
    getValuesAt(time, seriesData?) {
        const result: any[] = [];
        for (const entry of this._indicators) {
            const fromSeries = seriesData?.get && Object.keys(entry.legendSources || {}).length > 0;
            const values = fromSeries
                ? this._pickValuesFromSeriesData(entry, seriesData)
                : this._pickValues(entry, time);
            if (!values) continue;
            const settings = IndicatorSettings.getIndicator(entry.type);
            const baseName = settings ? settings.name : entry.type;
            // Append the param tuple — "SMA(20)" matches the price-scale tag on
            // the chart so the legend line maps cleanly to the series axis label.
            const params = entry.params && Object.values(entry.params);
            const name = (params && params.length > 0) ? `${baseName}(${params.join(',')})` : baseName;
            result.push({
                id: entry.id,
                type: entry.type,
                name,
                values,
                colors: entry.colors,
                // paneId=null → overlay on the main chart; anything else is in
                // a sub-pane. Legend consumers can filter to avoid listing a
                // sub-pane indicator's values inside the main price-chart legend.
                paneId: entry.paneId,
            });
        }
        return result;
    }

    _pickValuesFromSeriesData(entry, seriesData) {
        const values: Record<string, number | null> = {};
        const keys = Array.isArray(entry.outputNames) && entry.outputNames.length > 0
            ? entry.outputNames
            : Object.keys(entry.legendSources || {});
        for (const key of keys) {
            const source = entry.legendSources?.[key];
            const point = source ? seriesData.get(source.series) : null;
            const raw = point == null ? null : point[source.field || 'value'];
            const numeric = raw == null ? NaN : Number(raw);
            values[key] = Number.isFinite(numeric) ? numeric : null;
        }
        return keys.length > 0 ? values : null;
    }

    _pickValues(entry, time) {
        if (time == null) return this._completeLegendValues(entry, entry._lastValues);

        const arr = entry._points || [];
        const target = this._toSec(time);
        // Binary search for this exact candle. Continuous indicators normally
        // have a point on every formed bar; sparse/shifted indicators do not.
        let lo = 0, hi = arr.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid].time === target) {
                return this._completeLegendValues(entry, arr[mid].values);
            }
            if (arr[mid].time < target) lo = mid + 1;
            else hi = mid - 1;
        }

        // Keep the output schema stable even when this candle has no value.
        // In particular Fractals alternates between `{up}` and `{down}` points;
        // returning both keys keeps legend DOM and painter colours aligned.
        return this._completeLegendValues(entry, null);
    }

    _completeLegendValues(entry, values) {
        const keys = Array.isArray(entry.outputNames) && entry.outputNames.length > 0
            ? entry.outputNames
            : Object.keys(values || {});
        if (keys.length === 0) return null;

        const complete: Record<string, number | null> = {};
        for (const key of keys) {
            const value = values && values[key];
            complete[key] = value == null ? null : Number(value);
        }
        return complete;
    }

    // Called by the wsClient client when the hub pushes a point for one of our subs.
    _onPoint(subId, point) {
        const entry = this._subIdToEntry.get(subId);
        if (!entry || !entry.seriesRefs.length) return;

        const rawTime = Math.floor(Date.parse(point.time) / 1000);
        // Sparse indicators (ZigZag, Fractals) give us shift=N meaning "the value
        // actually belongs to the bar N closes back". Move the render time back
        // to that earlier bar so markers/pivots land where traders expect.
        const time = this._shiftTime(rawTime, point.shift);

        const lastValues: Record<string, number> = {};
        for (let i = 0; i < entry.seriesRefs.length && i < point.values.length; i++) {
            const series = entry.seriesRefs[i];
            const value = point.values[i];
            if (value == null || series == null) continue;
            const num = Number(value);
            try { series.update({ time, value: num }); } catch { }
            const key = entry.outputNames[i] || 'value';
            lastValues[key] = num;
        }
        if (Object.keys(lastValues).length > 0) {
            entry._lastValues = lastValues;
            // Append/merge into the hover-history. Same bar (finalised preview
            // → finalised close) comes back multiple times, so update the
            // existing slot rather than duplicating.
            if (!entry._points) entry._points = [];
            const last = entry._points[entry._points.length - 1];
            if (last && last.time === time) {
                Object.assign(last.values, lastValues);
            } else {
                entry._points.push({ time, values: { ...lastValues } });
                // Cap the buffer — crosshair precision only needs recent
                // history within the visible candle range.
                if (entry._points.length > 2000) entry._points.shift();
            }
        }
    }

    _shiftTime(rawTime, shift) {
        if (!shift || shift <= 0 || !this._candles.length) return rawTime;
        // Walk the current candle array backwards N bars from rawTime. If we
        // can't find rawTime in the array, fall back to timeframe-based maths.
        const idx = this._candles.findIndex(c => {
            const t = typeof c.time === 'number' ? c.time : Math.floor(new Date(c.time).getTime() / 1000);
            return t === rawTime;
        });
        if (idx >= shift) {
            const c = this._candles[idx - shift];
            return typeof c.time === 'number' ? c.time : Math.floor(new Date(c.time).getTime() / 1000);
        }
        // Fallback: subtract N * timeframe-seconds derived from the last two bars.
        if (this._candles.length >= 2) {
            const a = this._candles[this._candles.length - 2];
            const b = this._candles[this._candles.length - 1];
            const ta = typeof a.time === 'number' ? a.time : Math.floor(new Date(a.time).getTime() / 1000);
            const tb = typeof b.time === 'number' ? b.time : Math.floor(new Date(b.time).getTime() / 1000);
            const tfSec = Math.max(1, tb - ta);
            return rawTime - shift * tfSec;
        }
        return rawTime;
    }

    _applyPointShifts(data) {
        const shiftPoint = (point: any) => {
            const shift = Number(point?.shift) || 0;
            if (shift <= 0) return point;
            return { ...point, time: this._shiftTime(this._toSec(point.time), shift) };
        };

        if (Array.isArray(data)) return data.map(shiftPoint);
        if (data && typeof data === 'object') {
            const shifted: Record<string, any> = {};
            for (const key of Object.keys(data)) {
                shifted[key] = Array.isArray(data[key]) ? data[key].map(shiftPoint) : data[key];
            }
            return shifted;
        }
        return data;
    }

    _historyToRendererShape(history) {
        const outputNames = history.outputNames || ['value'];
        const points = history.points || [];

        const withTime = points.map((p: any) => {
            const raw = Math.floor(Date.parse(p.time) / 1000);
            return {
                time: this._shiftTime(raw, p.shift),
                values: p.values || [],
            };
        });

        if (outputNames.length === 1) {
            return withTime
                .filter((p: any) => p.values[0] != null)
                .map((p: any) => ({ time: p.time, value: Number(p.values[0]) }));
        }

        const result: Record<string, any> = {};
        for (let i = 0; i < outputNames.length; i++) {
            result[outputNames[i]] = withTime
                .filter((p: any) => p.values[i] != null)
                .map((p: any) => ({ time: p.time, value: Number(p.values[i]) }));
        }
        return result;
    }

    _mergeParams(settings, params) {
        const merged: Record<string, any> = {};
        settings.params.forEach((p: any) => {
            merged[p.key] = (params && params[p.key] !== undefined) ? params[p.key] : p.default;
        });
        return merged;
    }

    _timeframeToEnum(tf) {
        // Server's CandleTimeframe enum uses minute counts as numeric values,
        // matching the numeric timeframe the client already tracks.
        return Number(tf) || 5;
    }

    _formatParams(params) {
        return Object.values(params).join(', ');
    }

    /// <summary>
    /// Picks an existing sub-pane that shares this indicator's natural Y-axis
    /// scale, or creates a new one. Two RSIs, or RSI + Stochastic, both land
    /// in the same 0..100 pane; a CCI (-1..+1) opens its own. When the
    /// catalog has no measure (legacy data path), falls back to opening a
    /// fresh pane per indicator — the old behaviour.
    /// </summary>
    _resolveSubPane(settings, mergedParams) {
        if (!this._paneManager) return null;

        const label = settings.name + ' (' + this._formatParams(mergedParams) + ')';
        const measure = settings.measure;

        if (measure && measure !== 'Price') {
            const existing = this._paneManager.getPaneByMeasure(measure);
            if (existing) return existing;
        }

        return this._paneManager.addPane(label, measure || null);
    }

}

