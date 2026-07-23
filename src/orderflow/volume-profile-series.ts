import type { SeriesOptions, TimeRange } from '../core/chart-api.js';
import type {
    CustomSeriesDefinition,
    IIncrementalSeriesDataProcessor,
    SeriesRendererContext,
} from '../series/registry.js';
import {
    normalizeFootprintBar,
    normalizeFootprintBars,
    type FootprintBar,
} from './model.js';
import {
    ExactVolumeProfileAccumulator,
    VolumeProfileStatus,
    calculateDevelopingVolumeProfile,
    calculateVolumeProfile,
    type DevelopingVolumeProfilePoint,
    type ReadyExactVolumeProfile,
    type VolumeProfileCalculationOptions,
} from './volume-profile.js';

export const VolumeProfileRangeMode = Object.freeze({
    Visible: 'visible',
    Fixed: 'fixed',
    Session: 'session',
} as const);
export type VolumeProfileRangeMode = typeof VolumeProfileRangeMode[
    keyof typeof VolumeProfileRangeMode
];

export const VolumeProfileDisplayMode = Object.freeze({
    Total: 'total',
    BidAsk: 'bid-ask',
    Delta: 'delta',
} as const);
export type VolumeProfileDisplayMode = typeof VolumeProfileDisplayMode[
    keyof typeof VolumeProfileDisplayMode
];

export const VolumeProfileAlignment = Object.freeze({
    Left: 'left',
    Right: 'right',
} as const);
export type VolumeProfileAlignment = typeof VolumeProfileAlignment[
    keyof typeof VolumeProfileAlignment
];

/** Serializable half-open session boundary [from, to). */
export interface VolumeProfileSessionRange {
    readonly id: string;
    readonly from: number;
    readonly to: number;
}

export interface ExactVolumeProfileRangeOptions {
    readonly rangeMode: VolumeProfileRangeMode;
    readonly fixedRange?: TimeRange;
    readonly sessionRanges: readonly VolumeProfileSessionRange[];
    /** Defaults to the viewport end. */
    readonly sessionAnchorTime?: number;
}

export interface ExactVolumeProfileSeriesOptions extends
    SeriesOptions,
    VolumeProfileCalculationOptions,
    ExactVolumeProfileRangeOptions {
    readonly displayMode: VolumeProfileDisplayMode;
    readonly alignment: VolumeProfileAlignment;
    readonly profileWidth: number;
    readonly cellOpacity: number;
    readonly totalColor: string;
    readonly bidColor: string;
    readonly askColor: string;
    readonly positiveDeltaColor: string;
    readonly negativeDeltaColor: string;
    readonly pocColor: string;
    readonly valueAreaColor: string;
    readonly developingValueAreaColor: string;
    readonly showPoc: boolean;
    readonly showValueArea: boolean;
    readonly showLabels: boolean;
    readonly showDevelopingLevels: boolean;
    readonly fontSize: number;
}

const RANGE_MODES = new Set<VolumeProfileRangeMode>(Object.values(VolumeProfileRangeMode));
const DISPLAY_MODES = new Set<VolumeProfileDisplayMode>(Object.values(VolumeProfileDisplayMode));
const ALIGNMENTS = new Set<VolumeProfileAlignment>(Object.values(VolumeProfileAlignment));

export const defaultExactVolumeProfileSeriesOptions: Readonly<ExactVolumeProfileSeriesOptions> =
    Object.freeze({
        tickSize: 0.01,
        priceOrigin: 0,
        valueAreaPercentage: 0.7,
        rangeMode: VolumeProfileRangeMode.Visible,
        sessionRanges: Object.freeze([]),
        displayMode: VolumeProfileDisplayMode.Total,
        alignment: VolumeProfileAlignment.Right,
        profileWidth: 0.24,
        cellOpacity: 0.68,
        totalColor: '#4a9eff',
        bidColor: '#ef5350',
        askColor: '#26a69a',
        positiveDeltaColor: '#26a69a',
        negativeDeltaColor: '#ef5350',
        pocColor: '#f6c344',
        valueAreaColor: '#7e57c2',
        developingValueAreaColor: '#b39ddb',
        showPoc: true,
        showValueArea: true,
        showLabels: true,
        showDevelopingLevels: false,
        fontSize: 11,
        priceLineVisible: false,
        lastValueVisible: false,
    });

/** Selects the exact source bars for visible, fixed, or serializable session ranges. */
export function selectExactVolumeProfileBars(
    bars: readonly FootprintBar[],
    visibleRange: TimeRange,
    options: Readonly<ExactVolumeProfileRangeOptions>,
): readonly FootprintBar[] {
    if (!Array.isArray(bars))
        throw new TypeError('sschart: exact volume-profile series bars must be an array');
    const visible = normalizeRange(visibleRange, 'visible range');
    validateRangeOptions(options);
    let from: number;
    let to: number;
    let halfOpen = false;
    if (options.rangeMode === VolumeProfileRangeMode.Visible) {
        from = visible.from;
        to = visible.to;
    } else if (options.rangeMode === VolumeProfileRangeMode.Fixed) {
        const fixed = normalizeRange(options.fixedRange, 'fixed range');
        from = fixed.from;
        to = fixed.to;
    } else {
        const anchor = options.sessionAnchorTime ?? visible.to;
        finite(anchor, 'volume-profile sessionAnchorTime');
        const session = findSession(options.sessionRanges, anchor);
        if (session === null) return Object.freeze([]);
        from = session.from;
        to = session.to;
        halfOpen = true;
    }
    return Object.freeze(bars.filter(bar => bar.time >= from
        && (halfOpen ? bar.time < to : bar.time <= to)));
}

type ProfileContext = SeriesRendererContext<FootprintBar, ExactVolumeProfileSeriesOptions>;

interface CachedProfileAnalysis {
    readonly profile: ReadyExactVolumeProfile;
    readonly developing: readonly DevelopingVolumeProfilePoint[];
}

const analysisCache = new WeakMap<FootprintBar, WeakMap<FootprintBar, Map<string, CachedProfileAnalysis>>>();

function analysisFor(
    bars: readonly FootprintBar[],
    options: Readonly<ExactVolumeProfileSeriesOptions>,
): CachedProfileAnalysis | null {
    if (bars.length === 0) return null;
    const first = bars[0];
    const last = bars[bars.length - 1];
    let byLast = analysisCache.get(first);
    if (byLast === undefined) {
        byLast = new WeakMap();
        analysisCache.set(first, byLast);
    }
    let entries = byLast.get(last);
    if (entries === undefined) {
        entries = new Map();
        byLast.set(last, entries);
    }
    const key = calculationKey(bars.length, options);
    const cached = entries.get(key);
    if (cached !== undefined) return cached;
    const profile = calculateVolumeProfile(bars, options);
    if (profile.status !== VolumeProfileStatus.Ready) return null;
    const result = Object.freeze({
        profile,
        developing: options.showDevelopingLevels
            ? calculateDevelopingVolumeProfile(bars, options)
            : Object.freeze([]),
    });
    entries.set(key, result);
    return result;
}

function drawExactVolumeProfile(context: ProfileContext): void {
    validateSeriesOptions(context.options);
    const selected = selectExactVolumeProfileBars(
        context.allData,
        context.visibleTimeRange,
        context.options,
    );
    const analysis = analysisFor(selected, context.options);
    if (analysis === null) return;
    drawHistogram(context, analysis.profile);
    if (analysis.developing.length > 0) drawDeveloping(context, analysis.developing);
}

function drawHistogram(context: ProfileContext, profile: ReadyExactVolumeProfile): void {
    const { target: ctx, options, pane } = context;
    const maximumWidth = pane.width * options.profileWidth;
    const maximumTotal = Math.max(...profile.levels.map(level => level.totalVolume), 1);
    const maximumDelta = Math.max(...profile.levels.map(level => Math.abs(level.delta)), 1);
    const reference = profile.levels[Math.floor(profile.levels.length / 2)].price;
    const cellHeight = Math.max(1, Math.abs(
        context.priceToCoordinate(reference + options.tickSize / 2)
        - context.priceToCoordinate(reference - options.tickSize / 2),
    ));
    const label = options.showLabels && cellHeight >= options.fontSize + 2 && maximumWidth >= 52;
    if (label) {
        ctx.font = `${options.fontSize}px ${context.theme.fontFamily}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = options.alignment === VolumeProfileAlignment.Right ? 'right' : 'left';
    }

    for (const level of profile.levels) {
        const y = context.priceToCoordinate(level.price);
        const top = y - cellHeight / 2;
        if (options.showValueArea
            && level.price >= profile.valueArea.low
            && level.price <= profile.valueArea.high) {
            const areaX = options.alignment === VolumeProfileAlignment.Right
                ? pane.right - maximumWidth : pane.left;
            fill(ctx, options.valueAreaColor, 0.1, areaX, top, maximumWidth, cellHeight);
        }
        drawProfileLevel(ctx, pane.left, pane.right, maximumWidth, top, cellHeight,
            level, maximumTotal, maximumDelta, options);
        if (label) {
            ctx.fillStyle = context.theme.textColor;
            const textX = options.alignment === VolumeProfileAlignment.Right
                ? pane.right - 3 : pane.left + 3;
            ctx.fillText(volumeText(level.totalVolume), textX, y, maximumWidth - 6);
        }
    }
    if (options.showPoc) {
        const y = Math.round(context.priceToCoordinate(profile.pocPrice)) + 0.5;
        ctx.strokeStyle = options.pocColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (options.alignment === VolumeProfileAlignment.Right) {
            ctx.moveTo(pane.right - maximumWidth, y);
            ctx.lineTo(pane.right, y);
        } else {
            ctx.moveTo(pane.left, y);
            ctx.lineTo(pane.left + maximumWidth, y);
        }
        ctx.stroke();
    }
}

function drawProfileLevel(
    ctx: CanvasRenderingContext2D,
    paneLeft: number,
    paneRight: number,
    maximumWidth: number,
    top: number,
    height: number,
    level: ReadyExactVolumeProfile['levels'][number],
    maximumTotal: number,
    maximumDelta: number,
    options: Readonly<ExactVolumeProfileSeriesOptions>,
): void {
    const alignRight = options.alignment === VolumeProfileAlignment.Right;
    if (options.displayMode === VolumeProfileDisplayMode.Delta) {
        const width = Math.abs(level.delta) / maximumDelta * maximumWidth;
        const x = alignRight ? paneRight - width : paneLeft;
        fill(ctx, level.delta >= 0 ? options.positiveDeltaColor : options.negativeDeltaColor,
            options.cellOpacity, x, top, width, height);
        return;
    }
    const width = level.totalVolume / maximumTotal * maximumWidth;
    const x = alignRight ? paneRight - width : paneLeft;
    if (options.displayMode === VolumeProfileDisplayMode.Total) {
        fill(ctx, options.totalColor, options.cellOpacity, x, top, width, height);
        return;
    }
    const bidWidth = level.totalVolume === 0 ? 0 : width * level.bidVolume / level.totalVolume;
    const askWidth = width - bidWidth;
    fill(ctx, options.bidColor, options.cellOpacity, x, top, bidWidth, height);
    fill(ctx, options.askColor, options.cellOpacity, x + bidWidth, top, askWidth, height);
}

function drawDeveloping(
    context: ProfileContext,
    points: readonly DevelopingVolumeProfilePoint[],
): void {
    const { target: ctx, options } = context;
    drawDevelopingLine(context, points, point => point.pocPrice, options.pocColor, 1.5);
    drawDevelopingLine(context, points, point => point.valueAreaHigh,
        options.developingValueAreaColor, 1);
    drawDevelopingLine(context, points, point => point.valueAreaLow,
        options.developingValueAreaColor, 1);
}

function drawDevelopingLine(
    context: ProfileContext,
    points: readonly DevelopingVolumeProfilePoint[],
    value: (point: DevelopingVolumeProfilePoint) => number,
    color: string,
    width: number,
): void {
    const ctx = context.target;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach((point, index) => {
        const x = context.timeToCoordinate(point.time);
        const y = context.priceToCoordinate(value(point));
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
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
    if (!(width > 0) || !(height > 0)) return;
    const previous = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = previous;
}

function volumeText(value: number): string {
    if (Math.abs(value) >= 1_000_000)
        return `${trim(value / 1_000_000)}M`;
    if (Math.abs(value) >= 1_000)
        return `${trim(value / 1_000)}K`;
    return trim(value);
}

function trim(value: number): string {
    return value.toFixed(Math.abs(value) >= 100 ? 0 : 1).replace(/\.0$/, '');
}

function createProcessor(): IIncrementalSeriesDataProcessor<
    FootprintBar,
    ExactVolumeProfileSeriesOptions
> {
    let length = 0;
    return {
        reset(data, options) {
            validateSeriesOptions(options);
            const normalized = normalizeFootprintBars(data, options);
            length = normalized.length;
            return { data: normalized };
        },
        update(point, options, kind) {
            validateSeriesOptions(options);
            const normalized = normalizeFootprintBar(point, options);
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

function calculationKey(
    length: number,
    options: Readonly<ExactVolumeProfileSeriesOptions>,
): string {
    return [
        length,
        options.tickSize,
        options.priceOrigin ?? 0,
        options.valueAreaPercentage ?? 0.7,
        options.pocTieBreak ?? 'closest-to-close',
        options.showDevelopingLevels,
    ].join('|');
}

function validateSeriesOptions(options: Readonly<ExactVolumeProfileSeriesOptions>): void {
    new ExactVolumeProfileAccumulator(options);
    validateRangeOptions(options);
    if (!DISPLAY_MODES.has(options.displayMode))
        throw new TypeError('sschart: exact volume-profile displayMode is invalid');
    if (!ALIGNMENTS.has(options.alignment))
        throw new TypeError('sschart: exact volume-profile alignment is invalid');
    fractionAboveZero(options.profileWidth, 'exact volume-profile profileWidth');
    unit(options.cellOpacity, 'exact volume-profile cellOpacity');
    positive(options.fontSize, 'exact volume-profile fontSize');
    for (const key of [
        'totalColor', 'bidColor', 'askColor', 'positiveDeltaColor', 'negativeDeltaColor',
        'pocColor', 'valueAreaColor', 'developingValueAreaColor',
    ] as const) {
        if (typeof options[key] !== 'string' || options[key].trim().length === 0)
            throw new TypeError(`sschart: exact volume-profile ${key} must be non-empty`);
    }
    for (const key of ['showPoc', 'showValueArea', 'showLabels', 'showDevelopingLevels'] as const) {
        if (typeof options[key] !== 'boolean')
            throw new TypeError(`sschart: exact volume-profile ${key} must be boolean`);
    }
}

function validateRangeOptions(options: Readonly<ExactVolumeProfileRangeOptions>): void {
    if (options === null || typeof options !== 'object')
        throw new TypeError('sschart: exact volume-profile range options are required');
    if (!RANGE_MODES.has(options.rangeMode))
        throw new TypeError('sschart: exact volume-profile rangeMode is invalid');
    if (options.rangeMode === VolumeProfileRangeMode.Fixed)
        normalizeRange(options.fixedRange, 'fixed range');
    if (!Array.isArray(options.sessionRanges))
        throw new TypeError('sschart: exact volume-profile sessionRanges must be an array');
    let previousTo = -Infinity;
    for (let index = 0; index < options.sessionRanges.length; index++) {
        const session = options.sessionRanges[index];
        if (session === null || typeof session !== 'object'
            || typeof session.id !== 'string' || session.id.trim().length === 0) {
            throw new TypeError(`sschart: exact volume-profile sessionRanges[${index}] is invalid`);
        }
        const range = normalizeRange(session, `sessionRanges[${index}]`);
        if (!(range.to > range.from))
            throw new RangeError(`sschart: exact volume-profile sessionRanges[${index}] must be non-empty`);
        if (range.from < previousTo)
            throw new RangeError('sschart: exact volume-profile sessionRanges must not overlap');
        previousTo = range.to;
    }
    if (options.sessionAnchorTime !== undefined)
        finite(options.sessionAnchorTime, 'exact volume-profile sessionAnchorTime');
}

function findSession(
    sessions: readonly VolumeProfileSessionRange[],
    anchor: number,
): VolumeProfileSessionRange | null {
    let low = 0;
    let high = sessions.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (sessions[middle].from <= anchor) low = middle + 1;
        else high = middle;
    }
    const candidate = sessions[low - 1];
    return candidate !== undefined && anchor < candidate.to ? candidate : null;
}

function normalizeRange(value: unknown, name: string): TimeRange {
    if (value === null || typeof value !== 'object')
        throw new TypeError(`sschart: exact volume-profile ${name} is required`);
    const range = value as Partial<TimeRange>;
    const from = finite(range.from, `exact volume-profile ${name}.from`);
    const to = finite(range.to, `exact volume-profile ${name}.to`);
    if (to < from)
        throw new RangeError(`sschart: exact volume-profile ${name} must be ascending`);
    return Object.freeze({ from, to });
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

function fractionAboveZero(value: unknown, name: string): number {
    const result = positive(value, name);
    if (result > 1) throw new RangeError(`sschart: ${name} must not exceed 1`);
    return result;
}

function unit(value: unknown, name: string): number {
    const result = finite(value, name);
    if (result < 0 || result > 1) throw new RangeError(`sschart: ${name} must be in [0, 1]`);
    return result;
}

export const ExactVolumeProfileSeries: CustomSeriesDefinition<
    FootprintBar,
    ExactVolumeProfileSeriesOptions
> = Object.freeze({
    type: 'ExactVolumeProfile',
    defaultOptions: defaultExactVolumeProfileSeriesOptions,
    renderer: Object.freeze({
        dataPadding: 0,
        drawOutsideVisibleRange: true,
        draw: drawExactVolumeProfile,
        priceRange: () => null,
        priceValue: () => null,
        colorAt: (_bar: FootprintBar, options: Readonly<ExactVolumeProfileSeriesOptions>) =>
            options.totalColor,
    }),
    incrementalDataProcessorFactory: createProcessor,
    affectsTimeScale: false,
});
