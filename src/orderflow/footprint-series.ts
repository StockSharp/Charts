import type { SeriesOptions } from '../core/chart-api.js';
import type {
    CustomSeriesDefinition,
    IIncrementalSeriesDataProcessor,
    SeriesPriceRange,
    SeriesRendererContext,
} from '../series/registry.js';
import {
    normalizeFootprintBar,
    normalizeFootprintBars,
    type FootprintBar,
} from './model.js';
import {
    FootprintAuctionCompletion,
    FootprintPocTieBreak,
    calculateFootprintMetrics,
    type FootprintBarMetrics,
    type FootprintMetricsOptions,
} from './metrics.js';

export const FootprintDisplayMode = Object.freeze({
    BidAsk: 'bid-ask',
    Delta: 'delta',
    Total: 'total',
    Ladder: 'ladder',
} as const);
export type FootprintDisplayMode = typeof FootprintDisplayMode[keyof typeof FootprintDisplayMode];

export const FootprintDetailLevel = Object.freeze({
    Auto: 'auto',
    Numbers: 'numbers',
    Heatmap: 'heatmap',
    Summary: 'summary',
} as const);
export type FootprintDetailLevel = typeof FootprintDetailLevel[keyof typeof FootprintDetailLevel];
export type ResolvedFootprintDetailLevel = Exclude<
    FootprintDetailLevel,
    typeof FootprintDetailLevel.Auto
>;

export interface FootprintDetailGeometry {
    readonly barSpacing: number;
    readonly cellHeight: number;
}

export interface FootprintSeriesOptions extends SeriesOptions, FootprintMetricsOptions {
    readonly mode: FootprintDisplayMode;
    readonly detailLevel: FootprintDetailLevel;
    readonly bidColor: string;
    readonly askColor: string;
    readonly positiveDeltaColor: string;
    readonly negativeDeltaColor: string;
    readonly totalColor: string;
    readonly pocColor: string;
    readonly valueAreaColor: string;
    readonly imbalanceColor: string;
    readonly unfinishedAuctionColor: string;
    readonly cellOpacity: number;
    readonly fontSize: number;
    readonly minimumNumbersBarSpacing: number;
    readonly minimumNumbersCellHeight: number;
    readonly minimumHeatmapBarSpacing: number;
    readonly minimumHeatmapCellHeight: number;
    readonly showPoc: boolean;
    readonly showValueArea: boolean;
    readonly showImbalances: boolean;
    readonly showUnfinishedAuctions: boolean;
}

const DISPLAY_MODES = new Set<FootprintDisplayMode>(Object.values(FootprintDisplayMode));
const DETAIL_LEVELS = new Set<FootprintDetailLevel>(Object.values(FootprintDetailLevel));
const POC_TIE_BREAKS = new Set<FootprintPocTieBreak>(Object.values(FootprintPocTieBreak));

export const defaultFootprintSeriesOptions: Readonly<FootprintSeriesOptions> = Object.freeze({
    tickSize: 0.01,
    priceOrigin: 0,
    valueAreaPercentage: 0.7,
    imbalanceRatio: 3,
    imbalanceMinimumVolume: 0,
    stackedImbalanceCount: 3,
    mode: FootprintDisplayMode.BidAsk,
    detailLevel: FootprintDetailLevel.Auto,
    bidColor: '#ef5350',
    askColor: '#26a69a',
    positiveDeltaColor: '#26a69a',
    negativeDeltaColor: '#ef5350',
    totalColor: '#4a9eff',
    pocColor: '#f6c344',
    valueAreaColor: '#7e57c2',
    imbalanceColor: '#ffffff',
    unfinishedAuctionColor: '#ff9800',
    cellOpacity: 0.72,
    fontSize: 11,
    minimumNumbersBarSpacing: 54,
    minimumNumbersCellHeight: 12,
    minimumHeatmapBarSpacing: 8,
    minimumHeatmapCellHeight: 2,
    showPoc: true,
    showValueArea: true,
    showImbalances: true,
    showUnfinishedAuctions: true,
    priceLineVisible: false,
    lastValueVisible: true,
});

export function resolveFootprintDetailLevel(
    geometry: FootprintDetailGeometry,
    options: Readonly<FootprintSeriesOptions> = defaultFootprintSeriesOptions,
): ResolvedFootprintDetailLevel {
    nonNegative(geometry.barSpacing, 'footprint detail barSpacing');
    nonNegative(geometry.cellHeight, 'footprint detail cellHeight');
    if (options.detailLevel !== FootprintDetailLevel.Auto)
        return options.detailLevel as ResolvedFootprintDetailLevel;
    if (geometry.barSpacing >= options.minimumNumbersBarSpacing
        && geometry.cellHeight >= options.minimumNumbersCellHeight) {
        return FootprintDetailLevel.Numbers;
    }
    if (geometry.barSpacing >= options.minimumHeatmapBarSpacing
        && geometry.cellHeight >= options.minimumHeatmapCellHeight) {
        return FootprintDetailLevel.Heatmap;
    }
    return FootprintDetailLevel.Summary;
}

type FootprintContext = SeriesRendererContext<FootprintBar, FootprintSeriesOptions>;

const metricCache = new WeakMap<FootprintBar, Map<string, FootprintBarMetrics>>();

function metricsFor(
    bar: FootprintBar,
    options: Readonly<FootprintSeriesOptions>,
): FootprintBarMetrics {
    const key = metricsKey(options);
    let entries = metricCache.get(bar);
    const cached = entries?.get(key);
    if (cached !== undefined) return cached;
    const metrics = calculateFootprintMetrics(bar, options);
    if (entries === undefined) {
        entries = new Map();
        metricCache.set(bar, entries);
    }
    entries.set(key, metrics);
    return metrics;
}

function drawFootprint(context: FootprintContext): void {
    validateSeriesOptions(context.options);
    const { target, options } = context;
    const width = Math.max(1, context.barSpacing * 0.92);
    for (const bar of context.data) {
        const metrics = metricsFor(bar, options);
        const cellHeight = tickCellHeight(context, bar, options.tickSize);
        const detail = resolveFootprintDetailLevel({
            barSpacing: context.barSpacing,
            cellHeight,
        }, options);
        if (detail === FootprintDetailLevel.Summary) {
            drawSummary(context, bar, metrics, width);
            continue;
        }
        drawLevels(context, bar, metrics, width, cellHeight, detail);
    }
}

function drawLevels(
    context: FootprintContext,
    bar: FootprintBar,
    metrics: FootprintBarMetrics,
    width: number,
    cellHeight: number,
    detail: typeof FootprintDetailLevel.Numbers | typeof FootprintDetailLevel.Heatmap,
): void {
    const { target: ctx, options } = context;
    const center = context.timeToCoordinate(bar.time);
    const left = center - width / 2;
    const maximumBid = Math.max(...metrics.levels.map(level => level.bidVolume), 1);
    const maximumAsk = Math.max(...metrics.levels.map(level => level.askVolume), 1);
    const maximumTotal = Math.max(...metrics.levels.map(level => level.totalVolume), 1);
    const maximumDelta = Math.max(...metrics.levels.map(level => Math.abs(level.delta)), 1);
    const showNumbers = detail === FootprintDetailLevel.Numbers;
    if (showNumbers) {
        ctx.font = `${options.fontSize}px ${context.theme.fontFamily}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
    }

    for (const level of metrics.levels) {
        const y = context.priceToCoordinate(level.price);
        const top = y - cellHeight / 2;
        if (options.showValueArea
            && level.price >= metrics.valueArea.low
            && level.price <= metrics.valueArea.high) {
            fill(ctx, options.valueAreaColor, 0.1, left, top, width, cellHeight);
        }
        drawModeCell(
            ctx,
            options,
            level,
            left,
            top,
            width,
            cellHeight,
            maximumBid,
            maximumAsk,
            maximumTotal,
            maximumDelta,
            showNumbers,
            context.theme.textColor,
        );
        if (options.showPoc && level.price === metrics.pocPrice) {
            ctx.strokeStyle = options.pocColor;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(left + 0.75, top + 0.75, Math.max(0, width - 1.5),
                Math.max(0, cellHeight - 1.5));
        }
        if (options.showImbalances) {
            drawImbalance(ctx, level.buyImbalance, level.sellImbalance,
                left, top, width, cellHeight, options.imbalanceColor);
        }
    }
    if (options.showUnfinishedAuctions)
        drawAuctionMarkers(context, bar, metrics, left, width, cellHeight);
}

function drawModeCell(
    ctx: CanvasRenderingContext2D,
    options: Readonly<FootprintSeriesOptions>,
    level: FootprintBarMetrics['levels'][number],
    left: number,
    top: number,
    width: number,
    height: number,
    maximumBid: number,
    maximumAsk: number,
    maximumTotal: number,
    maximumDelta: number,
    showNumbers: boolean,
    textColor: string,
): void {
    const half = width / 2;
    if (options.mode === FootprintDisplayMode.BidAsk) {
        fill(ctx, options.bidColor, intensity(level.bidVolume, maximumBid, options.cellOpacity),
            left, top, half, height);
        fill(ctx, options.askColor, intensity(level.askVolume, maximumAsk, options.cellOpacity),
            left + half, top, half, height);
        if (showNumbers) drawText(ctx, `${volumeText(level.bidVolume)} × ${volumeText(level.askVolume)}`,
            left + width / 2, top + height / 2, width, textColor);
        return;
    }
    if (options.mode === FootprintDisplayMode.Delta) {
        const color = level.delta >= 0 ? options.positiveDeltaColor : options.negativeDeltaColor;
        fill(ctx, color, intensity(Math.abs(level.delta), maximumDelta, options.cellOpacity),
            left, top, width, height);
        if (showNumbers) drawText(ctx, signedVolumeText(level.delta),
            left + width / 2, top + height / 2, width, textColor);
        return;
    }
    if (options.mode === FootprintDisplayMode.Total) {
        fill(ctx, options.totalColor,
            intensity(level.totalVolume, maximumTotal, options.cellOpacity),
            left, top, width, height);
        if (showNumbers) drawText(ctx, volumeText(level.totalVolume),
            left + width / 2, top + height / 2, width, textColor);
        return;
    }

    const bidWidth = half * level.bidVolume / maximumBid;
    const askWidth = half * level.askVolume / maximumAsk;
    fill(ctx, options.bidColor, options.cellOpacity,
        left + half - bidWidth, top, bidWidth, height);
    fill(ctx, options.askColor, options.cellOpacity,
        left + half, top, askWidth, height);
    if (showNumbers) {
        ctx.textAlign = 'right';
        drawText(ctx, volumeText(level.bidVolume), left + half - 2,
            top + height / 2, half - 3, textColor);
        ctx.textAlign = 'left';
        drawText(ctx, volumeText(level.askVolume), left + half + 2,
            top + height / 2, half - 3, textColor);
        ctx.textAlign = 'center';
    }
}

function drawSummary(
    context: FootprintContext,
    bar: FootprintBar,
    metrics: FootprintBarMetrics,
    width: number,
): void {
    const { target: ctx, options } = context;
    const center = context.timeToCoordinate(bar.time);
    const high = context.priceToCoordinate(bar.high);
    const low = context.priceToCoordinate(bar.low);
    const open = context.priceToCoordinate(bar.open);
    const close = context.priceToCoordinate(bar.close);
    const color = metrics.delta >= 0 ? options.positiveDeltaColor : options.negativeDeltaColor;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(center) + 0.5, high);
    ctx.lineTo(Math.round(center) + 0.5, low);
    ctx.stroke();
    const bodyWidth = Math.max(1, Math.min(width, context.barSpacing * 0.74));
    fill(ctx, color, options.cellOpacity, center - bodyWidth / 2,
        Math.min(open, close), bodyWidth, Math.max(1, Math.abs(close - open)));
    if (options.showPoc) {
        const y = context.priceToCoordinate(metrics.pocPrice);
        ctx.fillStyle = options.pocColor;
        ctx.fillRect(center - bodyWidth / 2, y - 0.75, bodyWidth, 1.5);
    }
}

function drawImbalance(
    ctx: CanvasRenderingContext2D,
    buy: boolean,
    sell: boolean,
    left: number,
    top: number,
    width: number,
    height: number,
    color: string,
): void {
    if (!buy && !sell) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    if (sell) ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, width / 2 - 1), Math.max(0, height - 1));
    if (buy) ctx.strokeRect(left + width / 2 + 0.5, top + 0.5,
        Math.max(0, width / 2 - 1), Math.max(0, height - 1));
}

function drawAuctionMarkers(
    context: FootprintContext,
    bar: FootprintBar,
    metrics: FootprintBarMetrics,
    left: number,
    width: number,
    cellHeight: number,
): void {
    const { target: ctx, options } = context;
    ctx.fillStyle = options.unfinishedAuctionColor;
    if (metrics.auction.high === FootprintAuctionCompletion.Unfinished) {
        triangle(ctx, left + width / 2, context.priceToCoordinate(bar.high) - cellHeight / 2, -1);
    }
    if (metrics.auction.low === FootprintAuctionCompletion.Unfinished) {
        triangle(ctx, left + width / 2, context.priceToCoordinate(bar.low) + cellHeight / 2, 1);
    }
}

function triangle(ctx: CanvasRenderingContext2D, x: number, y: number, direction: -1 | 1): void {
    const radius = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + direction * radius);
    ctx.lineTo(x - radius, y - direction * radius);
    ctx.lineTo(x + radius, y - direction * radius);
    ctx.closePath();
    ctx.fill();
}

function fill(
    ctx: CanvasRenderingContext2D,
    color: string,
    alpha: number,
    x: number,
    y: number,
    width: number,
    height: number,
): void {
    if (!(width > 0) || !(height > 0) || !(alpha > 0)) return;
    const previous = ctx.globalAlpha;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = previous;
}

function drawText(
    ctx: CanvasRenderingContext2D,
    value: string,
    x: number,
    y: number,
    maximumWidth: number,
    color: string,
): void {
    ctx.fillStyle = color;
    ctx.fillText(value, x, y, Math.max(0, maximumWidth - 4));
}

function tickCellHeight(context: FootprintContext, bar: FootprintBar, tickSize: number): number {
    const reference = bar.levels[Math.floor(bar.levels.length / 2)].price;
    return Math.max(1, Math.abs(
        context.priceToCoordinate(reference + tickSize / 2)
        - context.priceToCoordinate(reference - tickSize / 2),
    ));
}

function intensity(value: number, maximum: number, opacity: number): number {
    if (!(value > 0)) return 0;
    return opacity * (0.18 + 0.82 * Math.min(1, value / maximum));
}

function signedVolumeText(value: number): string {
    return value > 0 ? `+${volumeText(value)}` : volumeText(value);
}

function volumeText(value: number): string {
    const absolute = Math.abs(value);
    if (absolute >= 1_000_000_000) return compact(value / 1_000_000_000, 'B');
    if (absolute >= 1_000_000) return compact(value / 1_000_000, 'M');
    if (absolute >= 1_000) return compact(value / 1_000, 'K');
    return compact(value, '');
}

function compact(value: number, suffix: string): string {
    const precision = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
    return `${value.toFixed(precision).replace(/\.0+$|([.][0-9])0+$/, '$1')}${suffix}`;
}

function footprintPriceRange(data: readonly FootprintBar[]): SeriesPriceRange | null {
    if (data.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const bar of data) {
        min = Math.min(min, bar.low);
        max = Math.max(max, bar.high);
    }
    return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

function footprintColor(
    bar: FootprintBar,
    options: Readonly<FootprintSeriesOptions>,
): string {
    let delta = 0;
    for (const level of bar.levels) delta += level.askVolume - level.bidVolume;
    return delta >= 0 ? options.positiveDeltaColor : options.negativeDeltaColor;
}

function createProcessor(): IIncrementalSeriesDataProcessor<FootprintBar, FootprintSeriesOptions> {
    let length = 0;
    return {
        reset(data, options) {
            validateSeriesOptions(options);
            const normalized = normalizeFootprintBars(data, options);
            for (const bar of normalized) metricsFor(bar, options);
            length = normalized.length;
            return { data: normalized };
        },
        update(point, options, kind) {
            validateSeriesOptions(options);
            const normalized = normalizeFootprintBar(point, options);
            metricsFor(normalized, options);
            const fromIndex = kind === 'append' ? length : Math.max(0, length - 1);
            if (kind === 'append') length++;
            return Object.freeze({
                fromIndex,
                removed: kind === 'append' ? 0 : 1,
                data: Object.freeze([normalized]),
            });
        },
    };
}

function metricsKey(options: Readonly<FootprintSeriesOptions>): string {
    return [
        options.tickSize,
        options.priceOrigin ?? 0,
        options.valueAreaPercentage ?? 0.7,
        options.imbalanceRatio ?? 3,
        options.imbalanceMinimumVolume ?? 0,
        options.stackedImbalanceCount ?? 3,
        options.pocTieBreak ?? 'closest-to-close',
    ].join('|');
}

function validateSeriesOptions(options: Readonly<FootprintSeriesOptions>): void {
    positive(options.tickSize, 'footprint series tickSize');
    if (options.priceOrigin !== undefined) finite(options.priceOrigin, 'footprint series priceOrigin');
    if (!DISPLAY_MODES.has(options.mode)) throw new TypeError('sschart: footprint series mode is invalid');
    if (!DETAIL_LEVELS.has(options.detailLevel))
        throw new TypeError('sschart: footprint series detailLevel is invalid');
    const valueAreaPercentage = options.valueAreaPercentage ?? 0.7;
    finite(valueAreaPercentage, 'footprint series valueAreaPercentage');
    if (!(valueAreaPercentage > 0 && valueAreaPercentage <= 1))
        throw new RangeError('sschart: footprint series valueAreaPercentage must be in (0, 1]');
    const imbalanceRatio = options.imbalanceRatio ?? 3;
    finite(imbalanceRatio, 'footprint series imbalanceRatio');
    if (imbalanceRatio < 1)
        throw new RangeError('sschart: footprint series imbalanceRatio must be at least 1');
    nonNegative(options.imbalanceMinimumVolume ?? 0,
        'footprint series imbalanceMinimumVolume');
    positiveInteger(options.stackedImbalanceCount ?? 3,
        'footprint series stackedImbalanceCount');
    const pocTieBreak = options.pocTieBreak ?? FootprintPocTieBreak.ClosestToClose;
    if (!POC_TIE_BREAKS.has(pocTieBreak))
        throw new TypeError('sschart: footprint series pocTieBreak is invalid');
    unit(options.cellOpacity, 'footprint series cellOpacity');
    positive(options.fontSize, 'footprint series fontSize');
    nonNegative(options.minimumNumbersBarSpacing, 'footprint series minimumNumbersBarSpacing');
    nonNegative(options.minimumNumbersCellHeight, 'footprint series minimumNumbersCellHeight');
    nonNegative(options.minimumHeatmapBarSpacing, 'footprint series minimumHeatmapBarSpacing');
    nonNegative(options.minimumHeatmapCellHeight, 'footprint series minimumHeatmapCellHeight');
    for (const key of [
        'bidColor', 'askColor', 'positiveDeltaColor', 'negativeDeltaColor', 'totalColor',
        'pocColor', 'valueAreaColor', 'imbalanceColor', 'unfinishedAuctionColor',
    ] as const) {
        if (typeof options[key] !== 'string' || options[key].trim().length === 0)
            throw new TypeError(`sschart: footprint series ${key} must be a non-empty string`);
    }
    for (const key of [
        'showPoc', 'showValueArea', 'showImbalances', 'showUnfinishedAuctions',
    ] as const) {
        if (typeof options[key] !== 'boolean')
            throw new TypeError(`sschart: footprint series ${key} must be boolean`);
    }
}

function finite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new TypeError(`sschart: ${name} must be finite`);
    return value;
}

function positive(value: unknown, name: string): number {
    const result = finite(value, name);
    if (!(result > 0)) throw new RangeError(`sschart: ${name} must be positive`);
    return result;
}

function nonNegative(value: unknown, name: string): number {
    const result = finite(value, name);
    if (result < 0) throw new RangeError(`sschart: ${name} must be non-negative`);
    return result;
}

function unit(value: unknown, name: string): number {
    const result = finite(value, name);
    if (result < 0 || result > 1) throw new RangeError(`sschart: ${name} must be in [0, 1]`);
    return result;
}

function positiveInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1)
        throw new RangeError(`sschart: ${name} must be a positive integer`);
    return value as number;
}

export const FootprintSeries: CustomSeriesDefinition<FootprintBar, FootprintSeriesOptions> =
    Object.freeze({
        type: 'Footprint',
        defaultOptions: defaultFootprintSeriesOptions,
        renderer: Object.freeze({
            dataPadding: 1,
            draw: drawFootprint,
            priceRange: footprintPriceRange,
            priceValue: (bar: FootprintBar) => bar.close,
            colorAt: footprintColor,
            magnetValues: (bar: FootprintBar) => [bar.open, bar.high, bar.low, bar.close],
        }),
        incrementalDataProcessorFactory: createProcessor,
    });
