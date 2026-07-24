// Maps computed indicator data to chart series through a catalog-selected painter.
// Indicators without a `painter` entry are always rendered by DefaultIndicatorPainter.
import { IndicatorSettings } from './indicator-settings.js';
import type { IndicatorPainter, IndicatorPainterContext, IndicatorSeriesKind } from './painters/indicator-painter.js';
import { createIndicatorPainter } from './painters/indicator-painter-registry.js';
import { DefaultIndicatorPainter } from './painters/default-painter.js';
import { registerBuiltInIndicatorPainters } from './painters/builtin-painters.js';

// Explicit registration so the built-in painters survive bundler tree-shaking
// (a bare side-effect import is dropped under `sideEffects: false`).
registerBuiltInIndicatorPainters();
import type {
    IndicatorRuntime,
    IndicatorRuntimePatch,
    IndicatorRuntimePoint,
} from '../../indicators/indicator-runtime.js';
import type { IndicatorParameters } from '../../indicators/indicator-definition.js';

declare const SSChart: any;

export class IndicatorRenderer {
    _mainChart: any;
    _lastColors: string[];

    constructor(mainChart: any) {
        this._mainChart = mainChart;
        this._lastColors = [];
    }

    setMainChart(chart: any): void {
        this._mainChart = chart;
    }

    getLastColors(): string[] {
        return this._lastColors.slice();
    }

    render(entry: any, data: any, paneChart: any, settings: any): any[] {
        const chart = paneChart || this._mainChart;
        if (!chart || !data) return [];

        const painter = this._createPainter(settings?.painter, entry.type);
        const context = this._createContext(chart, entry, data, settings);

        let result;
        try {
            result = painter.paint(context);
        } catch (error) {
            // A broken optional plugin must not make the indicator impossible to add.
            // Leave a useful diagnostic and retain the documented plain-line fallback.
            console.error(`[Indicators] painter '${settings?.painter}' failed for ${entry.type}; using default painter.`, error);
            const fallback = new DefaultIndicatorPainter();
            result = fallback.paint(context);
            entry._painter = fallback;
        }

        entry._painter = entry._painter || painter;
        entry._painterContext = context;
        const series = result?.series || [];
        entry.styleSources = this._resolveStyleSources(result?.styleSources, series, entry.type);
        entry.legendSources = {};
        for (const [key, source] of Object.entries(result?.legendSources || {})) {
            const typed = source as {
                seriesIndex: number;
                field?: string;
                colorOption?: string;
                lineWidthOption?: string;
                lineStyleOption?: string;
                visibilityOption?: string;
            };
            const sourceSeries = series[typed.seriesIndex];
            if (sourceSeries !== undefined) {
                entry.legendSources[key] = {
                    series: sourceSeries,
                    field: typed.field || 'value',
                    colorOption: typed.colorOption,
                    lineWidthOption: typed.lineWidthOption,
                    lineStyleOption: typed.lineStyleOption,
                    visibilityOption: typed.visibilityOption,
                };
            }
        }
        this._lastColors = result?.colors?.slice() || [];
        return series;
    }

    update(entry: any, data: any, paneChart: any, settings: any): void {
        if (!data || !entry.seriesRefs?.length) return;
        const chart = paneChart || this._mainChart;
        if (!chart) return;

        const painter: IndicatorPainter = entry._painter || this._createPainter(settings?.painter, entry.type);
        const context = this._createContext(chart, entry, data, settings);
        painter.update(context, entry.seriesRefs);
        entry._painter = painter;
        entry._painterContext = context;
    }

    moveSeries(entry: any, paneChart: any = null): void {
        const targetChart = paneChart || this._mainChart;
        if (!targetChart) throw new Error('sschart: indicator target chart is unavailable');
        if (paneChart) {
            if (typeof paneChart.adoptSeries !== 'function')
                throw new Error('sschart: indicator pane adapter cannot adopt series');
            for (const series of entry.seriesRefs || []) paneChart.adoptSeries(series);
        } else {
            if (typeof this._mainChart?.moveSeries !== 'function'
                || typeof this._mainChart?.panes !== 'function') {
                throw new Error('sschart: indicator main chart cannot move series');
            }
            const panes = this._mainChart.panes();
            const main = panes.find((pane: any) => pane.id() === 'main') || panes[0];
            if (!main) throw new Error('sschart: indicator main pane is unavailable');
            for (const series of entry.seriesRefs || []) this._mainChart.moveSeries(series, main);
        }
        if (entry._painterContext) {
            entry._painterContext = {
                ...entry._painterContext,
                chart: targetChart,
            };
        }
    }

    prepareRuntime(
        entry: any,
        runtime: IndicatorRuntime<any, IndicatorParameters>,
        runtimePoints: readonly IndicatorRuntimePoint[] = runtime.points(),
    ): void {
        const histories: Record<string, Array<{ targetIndex: number; time: number }>> = {};
        for (const output of entry.outputNames || []) {
            const points = runtimePoints.filter((point) => (
                point.outputId === output && point.time !== null
            ));
            histories[output] = points.map((point) => ({
                targetIndex: point.targetIndex,
                time: point.time as number,
            }));
        }
        entry._runtimeTailHistory = histories;
    }

    updateRuntime(
        entry: any,
        patch: IndicatorRuntimePatch,
        runtime: IndicatorRuntime<any, IndicatorParameters>,
    ): boolean {
        const painter: IndicatorPainter | null = entry._painter || null;
        if (!painter?.applyPatch || !entry.seriesRefs?.length) return false;
        return painter.applyPatch({
            entry,
            patch,
            points: (outputId) => runtime.points(outputId),
        }, entry.seriesRefs);
    }

    removeSeries(entry: any): void {
        const chart = entry._painterContext?.chart || this._mainChart;
        try { entry._painter?.dispose?.(entry._painterContext); } catch { /* plugin cleanup is best-effort */ }

        if (chart) {
            for (const series of entry.seriesRefs || []) {
                try { chart.removeSeries(series); } catch { /* already removed */ }
            }
        }

        entry.seriesRefs = [];
        entry.styleSources = {};
        entry.legendSources = {};
        entry._painter = null;
        entry._painterContext = null;
    }

    private _resolveStyleSources(
        declared: Readonly<Record<string, number>> | undefined,
        series: any[],
        indicatorType: string,
    ): Record<string, any> {
        const result: Record<string, any> = {};
        const assigned = new Set<number>();
        for (const [rawKey, index] of Object.entries(declared || {})) {
            const key = rawKey.trim();
            if (key.length === 0 || key === '__proto__' || key === 'prototype'
                || key === 'constructor' || !Number.isSafeInteger(index)
                || index < 0 || index >= series.length || assigned.has(index)) {
                console.warn(`[Indicators] invalid style source '${rawKey}' for ${indicatorType}; using a stable fallback.`);
                continue;
            }
            result[key] = series[index];
            assigned.add(index);
        }
        for (let index = 0; index < series.length; index++) {
            if (assigned.has(index)) continue;
            let key = `series-${index}`;
            while (Object.prototype.hasOwnProperty.call(result, key)) key += '-fallback';
            result[key] = series[index];
        }
        return result;
    }

    private _createPainter(name: string | undefined, indicatorType: string): IndicatorPainter {
        if (!name) return new DefaultIndicatorPainter();
        const painter = createIndicatorPainter(name);
        if (painter) return painter;
        console.warn(`[Indicators] painter '${name}' for ${indicatorType} is not registered; using default painter.`);
        return new DefaultIndicatorPainter();
    }

    private _createContext(chart: any, entry: any, data: any, settings: any): IndicatorPainterContext {
        const output = (name = 'value'): any[] => {
            if (Array.isArray(data)) return data;
            return data && Array.isArray(data[name]) ? data[name] : [];
        };

        const definition = (kind: IndicatorSeriesKind): any => {
            switch (kind) {
                case 'histogram': return SSChart.HistogramSeries;
                case 'area': return SSChart.AreaSeries;
                case 'band': return SSChart.BandSeries;
                default: return SSChart.LineSeries;
            }
        };

        return {
            chart,
            entry,
            data,
            settings,
            nextColor: () => IndicatorSettings.getNextColor(),
            output,
            addSeries: (kind: IndicatorSeriesKind, options: any, seriesData: any[] = []) => {
                const series = chart.addSeries(definition(kind), { ...(options || {}), persist: false });
                series.setData(seriesData || []);
                return series;
            },
        };
    }
}
