import type {
    IndicatorRuntimePatch,
    IndicatorRuntimePoint,
} from '../../../indicators/indicator-runtime.js';

/**
 * Public contract used by built-in and application supplied indicator painters.
 * A painter owns the choice and ordering of chart series for one indicator.
 */
export type IndicatorSeriesKind = 'line' | 'histogram' | 'area' | 'band';

export interface IndicatorPainterContext {
    readonly chart: any;
    readonly entry: any;
    readonly data: any;
    readonly settings: any;

    /** Allocate a colour from the shared indicator palette. */
    nextColor(): string;

    /** Return one named output, or the flat data array for a single-output indicator. */
    output(name?: string): any[];

    /** Create a chart series and seed it with data. */
    addSeries(kind: IndicatorSeriesKind, options: any, data?: any[]): any;
}

export interface IndicatorPaintResult {
    /** Every series owned by the painter. They are removed with the indicator. */
    series: any[];

    /** Stable style key -> series index mapping used by workspace persistence. */
    styleSources?: Readonly<Record<string, number>>;

    /** Legend colours in entry.outputNames order. */
    colors?: string[];

    /** Maps each legend output to the rendered series field that owns it. */
    legendSources?: Record<string, {
        seriesIndex: number;
        field?: string;
        colorOption?: string;
        lineWidthOption?: string;
        lineStyleOption?: string;
        visibilityOption?: string;
    }>;
}

export interface IndicatorPainterPatchContext {
    readonly entry: any;
    readonly patch: IndicatorRuntimePatch;
    /** Points still retained by the runtime; compact streaming history may be absent. */
    points(outputId: string): readonly IndicatorRuntimePoint[];
}

export interface IndicatorPainter {
    paint(context: IndicatorPainterContext): IndicatorPaintResult;
    update(context: IndicatorPainterContext, series: any[]): void;

    /** Applies an incremental runtime patch; false requests one full painter refresh. */
    applyPatch?(context: IndicatorPainterPatchContext, series: any[]): boolean;

    /** Optional cleanup for resources other than the returned chart series. */
    dispose?(context: IndicatorPainterContext): void;
}

export type IndicatorPainterFactory = () => IndicatorPainter;
