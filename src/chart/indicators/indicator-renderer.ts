// Maps computed indicator data to chart series through a catalog-selected painter.
// Indicators without a `painter` entry are always rendered by DefaultIndicatorPainter.
import { IndicatorSettings } from './indicator-settings.js';
import type { IndicatorPainter, IndicatorPainterContext, IndicatorSeriesKind } from './painters/indicator-painter.js';
import { createIndicatorPainter } from './painters/indicator-painter-registry.js';
import { DefaultIndicatorPainter } from './painters/default-painter.js';
import './painters/builtin-painters.js';
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
        entry.legendSources = {};
        for (const [key, source] of Object.entries(result?.legendSources || {})) {
            const typed = source as { seriesIndex: number; field?: string };
            const sourceSeries = series[typed.seriesIndex];
            if (sourceSeries !== undefined) {
                entry.legendSources[key] = {
                    series: sourceSeries,
                    field: typed.field || 'value',
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
        entry.legendSources = {};
        entry._painter = null;
        entry._painterContext = null;
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
                const series = chart.addSeries(definition(kind), options || {});
                series.setData(seriesData || []);
                return series;
            },
        };
    }
}
