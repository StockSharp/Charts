import type {
    IndicatorOutputAppearance,
    IndicatorOutputStylePatch,
} from '../../indicators/indicator-output-style.js';
import { normalizeIndicatorOutputStylePatch } from '../../indicators/indicator-output-style.js';

export interface IndicatorStyleSeries {
    readonly options?: (() => object) | object;
    applyOptions?(options: object): void;
}

export interface IndicatorStyleOwner {
    readonly type?: string;
    readonly seriesRefs?: readonly IndicatorStyleSeries[];
    readonly styleSources?: Readonly<Record<string, IndicatorStyleSeries>>;
    readonly outputNames?: readonly string[];
    readonly legendSources?: Readonly<Record<string, {
        readonly series?: IndicatorStyleSeries;
        readonly field?: string;
        readonly colorOption?: string;
        readonly lineWidthOption?: string;
        readonly lineStyleOption?: string;
        readonly visibilityOption?: string;
    }>>;
    colors?: string[];
    visible?: boolean;
}

const visibilitySnapshots = new WeakMap<
    IndicatorStyleOwner,
    Map<IndicatorStyleSeries, boolean | undefined>
>();

/** Returns painter-owned visual options only; runtime ids and scale routing stay transient. */
export function captureIndicatorStyles(
    entry: IndicatorStyleOwner,
): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    for (const [styleId, series] of styleSources(entry)) {
        const raw = seriesOptions(series);
        if (raw === undefined) continue;
        if (!plainObject(raw))
            throw new TypeError(`sschart: indicator style '${styleId}' options must be an object`);
        const { id: _id, persist: _persist, priceScaleId: _priceScaleId, ...captured } = raw;
        const options: Record<string, unknown> = { ...captured };
        const snapshot = entry.visible === false ? visibilitySnapshots.get(entry) : undefined;
        if (snapshot?.has(series)) {
            const desired = snapshot.get(series);
            if (desired === undefined) delete options.visible;
            else options.visible = desired;
        }
        result[styleId] = options;
    }
    return result;
}

/** Applies styles by semantic painter key and reports keys unavailable in this painter version. */
export function applyIndicatorStyles(
    entry: IndicatorStyleOwner,
    styles: Readonly<Record<string, unknown>>,
): readonly string[] {
    if (!plainObject(styles))
        throw new TypeError('sschart: indicator styles must be an object');
    const sources = new Map(styleSources(entry));
    const skipped: string[] = [];
    for (const [styleId, raw] of Object.entries(styles)) {
        const series = sources.get(styleId);
        if (series === undefined || typeof series.applyOptions !== 'function') {
            skipped.push(styleId);
            continue;
        }
        if (!plainObject(raw))
            throw new TypeError(`sschart: indicator style '${styleId}' must be an object`);
        const { id: _id, persist: _persist, priceScaleId: _priceScaleId, ...rawOptions } = raw;
        const options: Record<string, unknown> = { ...rawOptions };
        if (Object.prototype.hasOwnProperty.call(options, 'visible')) {
            const snapshot = entry.visible === false
                ? hiddenVisibilitySnapshot(entry)
                : visibilitySnapshots.get(entry);
            snapshot?.set(series, normalizedVisibility(options.visible));
            if (entry.visible === false) options.visible = false;
        }
        series.applyOptions(options);
    }
    enforceIndicatorVisibility(entry);
    refreshIndicatorLegendColors(entry);
    refreshIndicatorVisibility(entry);
    return Object.freeze(skipped);
}

/** Replaces painter options exactly, clearing fields absent from the supplied snapshot. */
export function replaceIndicatorStyles(
    entry: IndicatorStyleOwner,
    styles: Readonly<Record<string, unknown>>,
): readonly string[] {
    if (!plainObject(styles))
        throw new TypeError('sschart: indicator styles must be an object');
    const sources = new Map(styleSources(entry));
    const exact: Record<string, Record<string, unknown>> = {};
    const skipped: string[] = [];
    for (const [styleId, raw] of Object.entries(styles)) {
        const series = sources.get(styleId);
        if (series === undefined || typeof series.applyOptions !== 'function') {
            skipped.push(styleId);
            continue;
        }
        if (!plainObject(raw))
            throw new TypeError(`sschart: indicator style '${styleId}' must be an object`);
        const current = seriesOptions(series);
        if (current !== undefined && !plainObject(current))
            throw new TypeError(`sschart: indicator style '${styleId}' options must be an object`);
        const target = stripRuntimeStyleOptions(raw);
        const previous = stripRuntimeStyleOptions(current || {});
        const patch: Record<string, unknown> = {};
        for (const key of new Set([...Object.keys(previous), ...Object.keys(target)])) {
            patch[key] = Object.prototype.hasOwnProperty.call(target, key)
                ? target[key]
                : undefined;
        }
        exact[styleId] = patch;
    }
    if (skipped.length > 0) return Object.freeze(skipped);
    applyIndicatorStyles(entry, exact);
    return Object.freeze([]);
}

/** Applies editor-facing style fields to the series/field that owns one output. */
export function applyIndicatorOutputStyle(
    entry: IndicatorStyleOwner,
    outputId: string,
    patch: IndicatorOutputStylePatch,
): boolean {
    if (typeof outputId !== 'string' || outputId.trim().length === 0)
        throw new TypeError('sschart: indicator output id must be non-empty');
    const normalized = normalizeIndicatorOutputStylePatch(patch);

    const source = entry.legendSources?.[outputId.trim()];
    if (source === undefined || source.series === undefined
        || typeof source.series.applyOptions !== 'function') return false;
    const series = source.series;
    const prefix = source.field === 'upper' ? 'upper' : source.field === 'lower' ? 'lower' : null;
    const options: Record<string, unknown> = {};
    if (normalized.color !== undefined)
        options[source.colorOption || (prefix ? `${prefix}Color` : 'color')] = normalized.color;
    if (normalized.lineWidth !== undefined)
        options[source.lineWidthOption || (prefix ? `${prefix}LineWidth` : 'lineWidth')]
            = normalized.lineWidth ?? undefined;
    if (normalized.lineStyle !== undefined)
        options[source.lineStyleOption || (prefix ? `${prefix}LineStyle` : 'lineStyle')]
            = normalized.lineStyle ?? undefined;
    if (normalized.visible !== undefined) {
        const visibilityOption = source.visibilityOption
            || (prefix ? `${prefix}LineVisible` : 'visible');
        if (visibilityOption === 'visible') {
            const snapshot = entry.visible === false
                ? hiddenVisibilitySnapshot(entry)
                : visibilitySnapshots.get(entry);
            snapshot?.set(series, normalized.visible);
            options.visible = entry.visible === false ? false : normalized.visible;
        } else {
            options[visibilityOption] = normalized.visible;
        }
    }
    if (normalized.precision !== undefined) {
        const current = seriesOptions(series);
        const priceFormat = plainObject(current) && plainObject(current.priceFormat)
            ? current.priceFormat : {};
        const { precision: _precision, ...formatWithoutPrecision } = priceFormat;
        options.priceFormat = normalized.precision === null
            ? (Object.keys(formatWithoutPrecision).length === 0
                ? undefined
                : formatWithoutPrecision)
            : { ...formatWithoutPrecision, precision: normalized.precision };
    }
    series.applyOptions!(options);
    refreshIndicatorLegendColors(entry);
    refreshIndicatorVisibility(entry);
    return true;
}

export function refreshIndicatorLegendColors(entry: IndicatorStyleOwner): void {
    const outputs = entry.outputNames || [];
    if (outputs.length === 0) return;
    const previous = entry.colors || [];
    entry.colors = outputs.map((outputId, index) => {
        const source = entry.legendSources?.[outputId];
        const raw = seriesOptions(source?.series);
        if (!plainObject(raw)) return previous[index] || '#d0d6de';
        const key = source?.colorOption
            || (source?.field === 'upper' ? 'upperColor'
                : source?.field === 'lower' ? 'lowerColor' : 'color');
        const color = raw[key] ?? raw.color ?? raw.lineColor ?? raw.topColor;
        return typeof color === 'string' ? color : (previous[index] || '#d0d6de');
    });
}

export function indicatorOutputVisible(entry: IndicatorStyleOwner, outputId: string): boolean {
    const source = entry.legendSources?.[outputId];
    if (source?.series === undefined) return true;
    const raw = seriesOptions(source?.series);
    if (!plainObject(raw)) return true;
    const prefix = source?.field === 'upper' ? 'upper'
        : source?.field === 'lower' ? 'lower' : null;
    const key = source?.visibilityOption || (prefix ? `${prefix}LineVisible` : 'visible');
    if (key === 'visible' && entry.visible === false) {
        const snapshot = visibilitySnapshots.get(entry);
        if (snapshot?.has(source.series)) return snapshot.get(source.series) !== false;
    } else if (raw.visible === false) {
        return false;
    }
    return raw[key] !== false;
}

/** Captures effective output fields through semantic painter mappings. */
export function captureIndicatorOutputStyles(
    entry: IndicatorStyleOwner,
): Readonly<Record<string, IndicatorOutputAppearance>> {
    const result: Record<string, IndicatorOutputAppearance> = {};
    for (const outputId of entry.outputNames || Object.keys(entry.legendSources || {})) {
        const source = entry.legendSources?.[outputId];
        const raw = seriesOptions(source?.series);
        const prefix = source?.field === 'upper' ? 'upper'
            : source?.field === 'lower' ? 'lower' : null;
        const colorKey = source?.colorOption || (prefix ? `${prefix}Color` : 'color');
        const widthKey = source?.lineWidthOption || (prefix ? `${prefix}LineWidth` : 'lineWidth');
        const styleKey = source?.lineStyleOption || (prefix ? `${prefix}LineStyle` : 'lineStyle');
        const priceFormat = plainObject(raw) && plainObject(raw.priceFormat)
            ? raw.priceFormat : undefined;
        const color = plainObject(raw) && typeof raw[colorKey] === 'string'
            ? raw[colorKey] as string : undefined;
        const lineWidth = plainObject(raw) && finiteNumber(raw[widthKey])
            ? raw[widthKey] as number : undefined;
        const lineStyle = plainObject(raw) && lineStyleValue(raw[styleKey])
            ? raw[styleKey] as IndicatorOutputAppearance['lineStyle'] : undefined;
        const precision = priceFormat !== undefined && safePrecision(priceFormat.precision)
            ? priceFormat.precision : undefined;
        result[outputId] = Object.freeze({
            ...(color === undefined ? {} : { color }),
            ...(lineWidth === undefined ? {} : { lineWidth }),
            ...(lineStyle === undefined ? {} : { lineStyle }),
            visible: indicatorOutputVisible(entry, outputId),
            ...(precision === undefined ? {} : { precision }),
        });
    }
    return Object.freeze(result);
}

export function refreshIndicatorVisibility(entry: IndicatorStyleOwner): void {
    entry.visible ??= true;
}

/** Changes group visibility without losing each painter series' own visibility choice. */
export function setIndicatorStyleVisibility(
    entry: IndicatorStyleOwner,
    visible: boolean,
): boolean {
    if (typeof visible !== 'boolean')
        throw new TypeError('sschart: indicator visible must be boolean');
    const current = entry.visible !== false;
    if (current === visible) return false;

    if (!visible) {
        const snapshot = hiddenVisibilitySnapshot(entry);
        for (const series of uniqueStyleSeries(entry)) {
            captureCurrentVisibility(snapshot, series);
            series.applyOptions?.({ visible: false });
        }
    } else {
        const snapshot = visibilitySnapshots.get(entry);
        for (const series of uniqueStyleSeries(entry)) {
            const desired = snapshot?.has(series) ? snapshot.get(series) : undefined;
            series.applyOptions?.({ visible: desired !== false });
        }
    }
    entry.visible = visible;
    return true;
}

/** Keeps painter series created after a group was hidden out of rendering and autoscale. */
export function enforceIndicatorVisibility(entry: IndicatorStyleOwner): void {
    if (entry.visible !== false) return;
    const snapshot = hiddenVisibilitySnapshot(entry);
    for (const series of uniqueStyleSeries(entry)) {
        if (!snapshot.has(series)) snapshot.set(series, currentSeriesVisibility(series));
        series.applyOptions?.({ visible: false });
    }
}

function styleSources(entry: IndicatorStyleOwner): Array<[string, IndicatorStyleSeries]> {
    const declared = entry.styleSources;
    if (declared !== undefined && Object.keys(declared).length > 0)
        return Object.entries(declared);
    return (entry.seriesRefs || []).map((series, index) => [`series-${index}`, series]);
}

function uniqueStyleSeries(entry: IndicatorStyleOwner): readonly IndicatorStyleSeries[] {
    return [...new Set(styleSources(entry).map(([, series]) => series))];
}

function hiddenVisibilitySnapshot(
    entry: IndicatorStyleOwner,
): Map<IndicatorStyleSeries, boolean | undefined> {
    let snapshot = visibilitySnapshots.get(entry);
    if (snapshot === undefined) {
        snapshot = new Map();
        visibilitySnapshots.set(entry, snapshot);
    }
    return snapshot;
}

function currentSeriesVisibility(series: IndicatorStyleSeries): boolean | undefined {
    const options = seriesOptions(series);
    return plainObject(options) ? normalizedVisibility(options.visible) : undefined;
}

function captureCurrentVisibility(
    snapshot: Map<IndicatorStyleSeries, boolean | undefined>,
    series: IndicatorStyleSeries,
): void {
    const current = currentSeriesVisibility(series);
    if (!snapshot.has(series)) {
        snapshot.set(series, current);
        return;
    }
    const previous = snapshot.get(series);
    const renderedPrevious = previous === false ? false : true;
    if (current !== renderedPrevious) snapshot.set(series, current);
}

function normalizedVisibility(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function stripRuntimeStyleOptions(
    value: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    const { id: _id, persist: _persist, priceScaleId: _priceScaleId, ...options } = value;
    return { ...options };
}

function finiteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function lineStyleValue(value: unknown): boolean {
    return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 4;
}

function safePrecision(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 12;
}

function seriesOptions(series: IndicatorStyleSeries | undefined): object | undefined {
    const options = series?.options;
    return typeof options === 'function'
        ? (options as () => object).call(series)
        : options;
}

function plainObject(value: unknown): value is Readonly<Record<string, unknown>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
