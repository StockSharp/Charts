// Indicator Engine — client-side compute over the live candle stream.
// Each indicator is a pure function from `(candles, params) → series` exposed
// through the IndicatorCalc registry under `calc/`. Engine drives the lifecycle
// (add / remove / live recompute), passes the latest candles into the calc,
// hands the result to IndicatorRenderer, and stores a per-bar history so the
// legend can resolve crosshair values without re-running the computation.
//
// No server round-trip, no wsClient.subscribeIndicator. Old `subId` field is
// kept on the entry object purely as a legacy placeholder — nothing reads it
// anymore. Live updates: terminal-app shares the chart's raw-candle array with
// the engine via setCandles (same reference), and chart.updatePrice mutates
// that array in place on every tick, then fires chart.onLiveBarUpdate →
// engine.onLiveUpdate(), which re-runs every active calc against the updated
// this._candles tail (coalesced per animation frame). The standalone
// appendCandle() path below stays available for callers that hand the engine
// its OWN candle array instead of sharing the chart's.
import { getCalcFn } from './calc/index.js';
import { IndicatorSettings } from './indicator-settings.js';
import { IndicatorRenderer } from './indicator-renderer.js';

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
    // Open time of the last candle already reflected in the sub-pane spine.
    // Lets onLiveUpdate extend the spine exactly once per new bar without a
    // full spine rebuild on every intra-bar tick.
    _lastSpineTime: any;

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
        this._indicators = []; // { id, subId, type, params, seriesRefs[], paneId, outputNames[] }
        this._nextId = 1;
        this._renderer = null;
        this._paneManager = null;
        this._wsClient = null;
        this._symbol = null;
        this._timeframe = null;
        this._subIdToEntry = new Map();
        this._candles = [];
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

    // Kept for API compatibility: the renderer uses chart candle data; indicator
    // math no longer relies on client-side bars, so we just mirror the pane spine.
    // We also keep the raw candle-times array handy so sparse indicators
    // (ZigZag/Fractals) can render shift-adjusted timestamps on the main chart.
    setCandles(candles) {
        this._candles = candles || [];
        if (this._paneManager) this._paneManager.setSpineFromCandles(this._candles);
        this._lastSpineTime = this._candles.length ? this._candles[this._candles.length - 1].time : null;
        // Re-render every active indicator against the fresh candle window.
        // This fires on symbol switch / timeframe change after the chart
        // pulled new candles via api.getCandles.
        for (const entry of this._indicators) this._recomputeAndRender(entry);
    }

    /// Live-tick recompute. terminal-app shares the chart's raw-candle array
    /// with the engine (setCandles stores that same reference), and
    /// chart.updatePrice mutates it in place — updating the last bar or pushing
    /// a new one — before firing chart.onLiveBarUpdate. So the candle window is
    /// already current here; we must NOT push again (that would duplicate the
    /// bar). We only (a) extend the sub-pane spine once per genuinely new bar so
    /// separate-pane indicators keep an x-slot for it, and (b) schedule a
    /// coalesced recompute+render so overlays (SMA/EMA/BB) and sub-pane
    /// indicators track the moving bar and new bars instead of freezing on the
    /// initial snapshot.
    onLiveUpdate() {
        if (!this._candles.length) return;
        const last = this._candles[this._candles.length - 1];
        if (this._paneManager && last && last.time !== this._lastSpineTime) {
            try { this._paneManager.appendSpineCandle(last); } catch { /* pane torn down */ }
            this._lastSpineTime = last.time;
        }
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
        // Live recompute, coalesced per animation frame. Alpaca crypto bursts
        // through 50-200 ticks/sec; calling renderer.setData (which rebuilds
        // every chart series internally) that often makes the
        // chart visibly flicker, the legend rows shimmer, and the edit/×
        // buttons impossible to click — mouseup lands on a freshly-painted
        // canvas. RAF gates us to one repaint per frame (~60fps) without
        // changing arithmetic correctness — last call wins.
        this._scheduleRender();
    }

    /// Coalesce a render burst into a single rAF callback. Indicators are
    /// stateless pure functions over this._candles, so the only thing the
    /// repeated calls were buying us was wasted setData passes.
    _scheduleRender() {
        if (this._renderPending) return;
        this._renderPending = true;
        const run = () => {
            this._renderPending = false;
            for (const entry of this._indicators) this._recomputeAndRender(entry);
        };
        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
            window.requestAnimationFrame(run);
        } else {
            // Node / tests path: setTimeout(0). Keeps test semantics — call
            // returns synchronously, recompute happens on next microtask.
            setTimeout(run, 0);
        }
    }

    // targetPaneId is a genuinely optional placement hint: when the user adds an
    // indicator via a sub-pane's ＋ button it names the pane to drop into; when
    // omitted, placement is automatic (overlay on the main chart, or a measure-
    // resolved sub-pane). Absent = auto is a legitimate default, so this stays
    // optional rather than threaded through every existing call site.
    add(type, params, targetPaneId?) {
        const settings = IndicatorSettings.getIndicator(type);
        if (!settings) return null;

        // Resolve the calc-registry key from the catalog entry's serverKind (the canonical kind,
        // which the registry indexes by), falling back to the id itself.
        const calcKind = (settings.serverKind || type).toLowerCase();
        const calcFn = getCalcFn(calcKind);
        if (!calcFn) {
            console.warn('[Indicators] no client-side calc for', type, '(kind=' + calcKind + ') — skipping');
            return null;
        }

        const id = this._nextId++;
        const mergedParams = this._mergeParams(settings, params);
        const entry = {
            id, type, calcKind, calcFn,
            params: mergedParams,
            seriesRefs: [], paneId: null, colors: [], outputNames: [], legendSources: {},
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
            entry.paneScaleId = firstInPane ? 'right' : ('ind' + id);
        }

        this._indicators.push(entry);
        this._recomputeAndRender(entry);

        if (this.onChange) this.onChange();
        return entry;
    }

    /// Run the calc against the current candle window and (re)render. Called
    /// from add() once at insertion time and from appendCandle / setCandles
    /// on every live update.
    _recomputeAndRender(entry) {
        if (!this._candles.length) return;
        let data;
        try {
            // Params already use the calc fn's own keys (from the registry meta), so feed them
            // straight in — no UI->calc rename (that indirection silently dropped several params).
            data = entry.calcFn(this._candles, entry.params);
        } catch (err) {
            console.error('[Indicators] calc failed for', entry.type, err);
            return;
        }
        if (!data) return;
        // Sparse indicators return ShiftedIndicatorValue semantics: the value
        // is confirmed on the current bar but belongs to an earlier bar.
        // Apply that bar shift before warm-up/null filtering so Fractals and
        // ZigZag markers land on the actual pivot, like the desktop chart.
        data = this._applyPointShifts(data);
        // Calc functions emit `{time, value:null}` for warm-up bars (the first
        // `length-1` outputs for SMA, length deltas for RSI, etc.). The chart
        // happily renders null as 0, which produces a visible vertical jump from
        // the chart baseline up to the first formed value. Strip non-finite
        // points before they reach setData. Works uniformly for single-output
        // (array) and multi-output (object of arrays) calcs.
        data = IndicatorEngine._stripNulls(data);

        // Output shape: single-output indicators return [{time, value}],
        // multi-output return { key1: [{time, value}], key2: [...] }.
        // outputNames captures the keys for legend hover.
        entry.outputNames = Array.isArray(data) ? ['value'] : Object.keys(data);

        const settings = IndicatorSettings.getIndicator(entry.type);
        const chart = entry.paneId ? this._paneManager.getChart(entry.paneId) : null;
        if (!entry.seriesRefs.length) {
            // First render — series don't exist yet; renderer builds them
            // on the right chart (main vs paneId sub-chart).
            entry.seriesRefs = this._renderer.render(entry, data, chart, settings) || [];
            entry.colors = this._renderer.getLastColors();
            this._applyPaneScale(entry, chart);
        } else {
            // Subsequent recompute is delegated to the painter instance that
            // created the series. It owns their order and data mapping; the
            // default painter maps outputNames to ordinary lines.
            try { this._renderer.update(entry, data, chart, settings); }
            catch (err) { console.warn('[Indicators] update failed for', entry.type, err); }
        }

        // Rebuild the per-bar lookup the legend uses on crosshair hover.
        entry._points = this._buildLegendPoints(entry, data);
        if (entry._points.length > 0) {
            entry._lastValues = entry._points[entry._points.length - 1].values;
        }
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

    // Re-subscribes every active indicator — used after a timeframe change so
    // the new tf drives history + streaming. The snapshot is captured before
    // removeAll() because remove() mutates _indicators in place.
    async resubscribeAll() {
        const snapshot = this._indicators.map(e => ({ type: e.type, params: { ...e.params } }));
        this.removeAll();
        for (const s of snapshot) await this.add(s.type, s.params);
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
        await this.remove(id);
        await this.add(type, merged);
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

