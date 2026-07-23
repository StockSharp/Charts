import {
    normalizeDrawingInstance,
    type DrawingInstance,
} from '../drawings/drawing-model.js';
import {
    normalizePersistedObject,
    type PersistedObject,
} from './json-value.js';

export const CHART_STATE_SCHEMA_VERSION = 1 as const;

export type PersistedChartOptions = PersistedObject;
export type PersistedSeriesOptions = PersistedObject;
export type PersistedIndicatorParameters = PersistedObject;
export type PersistedIndicatorStyles = PersistedObject;
export type PersistedDrawing = DrawingInstance;

export interface PersistedPriceScale {
    readonly id: string;
    readonly mode?: number;
    readonly autoScale?: boolean;
    readonly scaleMargins?: Readonly<{ top: number; bottom: number }>;
}

export interface PersistedPane {
    readonly id: string;
    readonly order: number;
    readonly height: number;
    readonly minHeight: number;
    readonly state: 'normal' | 'minimized' | 'maximized';
    readonly priceScales: readonly PersistedPriceScale[];
}

export interface PersistedSeries {
    readonly id: string;
    readonly type: string;
    readonly paneId: string;
    readonly priceScaleId: string;
    readonly options: PersistedSeriesOptions;
}

export interface PersistedIndicator {
    readonly id: string;
    readonly type: string;
    readonly paneId: string | null;
    readonly params: PersistedIndicatorParameters;
    readonly styles: PersistedIndicatorStyles;
}

export interface ChartStateV1 {
    readonly schemaVersion: typeof CHART_STATE_SCHEMA_VERSION;
    readonly chartOptions: PersistedChartOptions;
    readonly panes: readonly PersistedPane[];
    readonly series: readonly PersistedSeries[];
    readonly indicators: readonly PersistedIndicator[];
    readonly drawings: readonly PersistedDrawing[];
}

export function normalizeChartStateV1(value: unknown): ChartStateV1 {
    const source = record(value, 'chart state');
    exactKeys(source, ['schemaVersion', 'chartOptions', 'panes', 'series', 'indicators', 'drawings'],
        'chart state');
    if (source.schemaVersion !== CHART_STATE_SCHEMA_VERSION)
        throw new RangeError('sschart: chart state schemaVersion must be 1');
    const chartOptions = normalizePersistedObject(source.chartOptions, 'chartOptions');
    const panes = array(source.panes, 'panes').map((item, index) => pane(item, index));
    if (panes.length === 0) throw new RangeError('sschart: chart state requires at least one pane');
    unique(panes, item => item.id, 'pane');
    const paneIds = new Set(panes.map(item => item.id));
    const series = array(source.series, 'series').map((item, index) => (
        persistedSeries(item, index, paneIds)
    ));
    unique(series, item => item.id, 'series');
    const indicators = array(source.indicators, 'indicators').map((item, index) => (
        indicator(item, index, paneIds)
    ));
    unique(indicators, item => item.id, 'indicator');
    const drawings = array(source.drawings, 'drawings').map((item, index) => {
        const raw = record(item, `drawings[${index}]`);
        exactKeys(raw, ['id', 'type', 'paneId', 'points', 'options', 'visible', 'locked', 'zOrder'],
            `drawings[${index}]`);
        const drawing = normalizeDrawingInstance(raw as unknown as DrawingInstance);
        requirePane(drawing.paneId, paneIds, `drawings[${index}]`);
        return drawing;
    });
    unique(drawings, item => item.id, 'drawing');
    return Object.freeze({
        schemaVersion: CHART_STATE_SCHEMA_VERSION,
        chartOptions,
        panes: Object.freeze(panes),
        series: Object.freeze(series),
        indicators: Object.freeze(indicators),
        drawings: Object.freeze(drawings),
    });
}

function pane(value: unknown, index: number): PersistedPane {
    const path = `panes[${index}]`;
    const source = record(value, path);
    exactKeys(source, ['id', 'order', 'height', 'minHeight', 'state', 'priceScales'], path);
    const state = source.state;
    if (state !== 'normal' && state !== 'minimized' && state !== 'maximized')
        throw new RangeError(`sschart: persisted ${path}.state is invalid`);
    const priceScales = array(source.priceScales, `${path}.priceScales`).map((item, scaleIndex) => (
        priceScale(item, `${path}.priceScales[${scaleIndex}]`)
    ));
    unique(priceScales, item => item.id, `price scale in ${path}`);
    return Object.freeze({
        id: identifier(source.id, `${path}.id`),
        order: safeInteger(source.order, `${path}.order`),
        height: nonNegative(source.height, `${path}.height`),
        minHeight: nonNegative(source.minHeight, `${path}.minHeight`),
        state,
        priceScales: Object.freeze(priceScales),
    });
}

function priceScale(value: unknown, path: string): PersistedPriceScale {
    const source = record(value, path);
    exactKeys(source, ['id', 'mode', 'autoScale', 'scaleMargins'], path, true);
    const result: {
        id: string;
        mode?: number;
        autoScale?: boolean;
        scaleMargins?: Readonly<{ top: number; bottom: number }>;
    } = { id: identifier(source.id, `${path}.id`) };
    if (source.mode !== undefined) {
        const mode = safeInteger(source.mode, `${path}.mode`);
        if (mode < 0 || mode > 3)
            throw new RangeError(`sschart: persisted ${path}.mode is invalid`);
        result.mode = mode;
    }
    if (source.autoScale !== undefined)
        result.autoScale = boolean(source.autoScale, `${path}.autoScale`);
    if (source.scaleMargins !== undefined) {
        const margins = record(source.scaleMargins, `${path}.scaleMargins`);
        exactKeys(margins, ['top', 'bottom'], `${path}.scaleMargins`);
        const top = fraction(margins.top, `${path}.scaleMargins.top`);
        const bottom = fraction(margins.bottom, `${path}.scaleMargins.bottom`);
        if (top + bottom >= 1)
            throw new RangeError(`sschart: persisted ${path}.scaleMargins must leave visible space`);
        result.scaleMargins = Object.freeze({ top, bottom });
    }
    return Object.freeze(result);
}

function persistedSeries(
    value: unknown,
    index: number,
    paneIds: ReadonlySet<string>,
): PersistedSeries {
    const path = `series[${index}]`;
    const source = record(value, path);
    exactKeys(source, ['id', 'type', 'paneId', 'priceScaleId', 'options'], path);
    const paneId = identifier(source.paneId, `${path}.paneId`);
    requirePane(paneId, paneIds, path);
    return Object.freeze({
        id: identifier(source.id, `${path}.id`),
        type: identifier(source.type, `${path}.type`),
        paneId,
        priceScaleId: identifier(source.priceScaleId, `${path}.priceScaleId`),
        options: normalizePersistedObject(source.options, `${path}.options`),
    });
}

function indicator(
    value: unknown,
    index: number,
    paneIds: ReadonlySet<string>,
): PersistedIndicator {
    const path = `indicators[${index}]`;
    const source = record(value, path);
    exactKeys(source, ['id', 'type', 'paneId', 'params', 'styles'], path);
    const paneId = source.paneId === null ? null : identifier(source.paneId, `${path}.paneId`);
    if (paneId !== null) requirePane(paneId, paneIds, path);
    const styles = normalizePersistedObject(source.styles, `${path}.styles`);
    for (const [styleId, options] of Object.entries(styles)) {
        if (options === null || typeof options !== 'object' || Array.isArray(options))
            throw new TypeError(`sschart: persisted ${path}.styles.${styleId} must be an object`);
    }
    return Object.freeze({
        id: identifier(source.id, `${path}.id`),
        type: identifier(source.type, `${path}.type`),
        paneId,
        params: normalizePersistedObject(source.params, `${path}.params`),
        styles,
    });
}

function record(value: unknown, path: string): Readonly<Record<string, unknown>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError(`sschart: persisted ${path} must be an object`);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError(`sschart: persisted ${path} must be a plain object`);
    return value as Readonly<Record<string, unknown>>;
}

function exactKeys(
    value: Readonly<Record<string, unknown>>,
    allowed: readonly string[],
    path: string,
    optional = false,
): void {
    const allowedSet = new Set(allowed);
    for (const key of Object.keys(value)) {
        if (!allowedSet.has(key))
            throw new TypeError(`sschart: persisted ${path}.${key} is not part of schema v1`);
    }
    if (optional) return;
    for (const key of allowed) {
        if (!Object.prototype.hasOwnProperty.call(value, key))
            throw new TypeError(`sschart: persisted ${path}.${key} is required`);
    }
}

function array(value: unknown, path: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`sschart: persisted ${path} must be an array`);
    return value;
}

function identifier(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: persisted ${path} must be a non-empty string`);
    return value.trim();
}

function safeInteger(value: unknown, path: string): number {
    if (!Number.isSafeInteger(value))
        throw new RangeError(`sschart: persisted ${path} must be a safe integer`);
    return value as number;
}

function nonNegative(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        throw new RangeError(`sschart: persisted ${path} must be non-negative`);
    return value;
}

function fraction(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1)
        throw new RangeError(`sschart: persisted ${path} must be in the [0, 1) range`);
    return value;
}

function boolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean')
        throw new TypeError(`sschart: persisted ${path} must be boolean`);
    return value;
}

function requirePane(id: string, paneIds: ReadonlySet<string>, path: string): void {
    if (!paneIds.has(id))
        throw new Error(`sschart: persisted ${path} references missing pane '${id}'`);
}

function unique<T>(items: readonly T[], id: (item: T) => string, name: string): void {
    const seen = new Set<string>();
    for (const item of items) {
        const value = id(item);
        if (seen.has(value)) throw new Error(`sschart: duplicate persisted ${name} id '${value}'`);
        seen.add(value);
    }
}
