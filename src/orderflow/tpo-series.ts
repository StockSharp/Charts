import type { CandlestickData, SeriesOptions } from '../core/chart-api.js';
import type {
    CustomSeriesDefinition,
    IIncrementalSeriesDataProcessor,
    SeriesPriceRange,
    SeriesRendererContext,
} from '../series/registry.js';
import {
    normalizeFootprintBars,
    normalizeTickAlignedCandle,
    type FootprintNormalizationOptions,
} from './model.js';

export interface TpoBar extends CandlestickData {
    /** Stable, serializable trading-session identity. */
    readonly sessionId: string;
}

export interface TpoCalculationOptions extends FootprintNormalizationOptions {
    readonly valueAreaPercentage?: number;
    readonly initialBalancePeriods?: number;
    readonly symbolSequence?: string;
    /** Safety bound for one candle's inclusive low/high tick span. */
    readonly maxLevelsPerBar?: number;
}

export interface TpoLevel {
    readonly price: number;
    readonly count: number;
    readonly periodIndexes: readonly number[];
    readonly symbols: readonly string[];
    readonly singlePrint: boolean;
}

export interface TpoValueArea {
    readonly low: number;
    readonly high: number;
    readonly count: number;
    readonly targetCount: number;
    readonly percentage: number;
}

export interface TpoSessionProfile {
    readonly sessionId: string;
    readonly from: number;
    readonly to: number;
    readonly periodCount: number;
    readonly totalTpos: number;
    readonly levels: readonly TpoLevel[];
    readonly pocPrice: number;
    readonly pocCount: number;
    readonly valueArea: TpoValueArea;
    readonly initialBalanceLow: number;
    readonly initialBalanceHigh: number;
}

interface NormalizedTpoOptions {
    readonly tickSize: number;
    readonly priceOrigin: number;
    readonly valueAreaPercentage: number;
    readonly initialBalancePeriods: number;
    readonly symbolSequence: string;
    readonly symbols: readonly string[];
    readonly maxLevelsPerBar: number;
}

interface MutableTpoLevel {
    readonly price: number;
    readonly periods: number[];
}

export function normalizeTpoBar(
    value: TpoBar,
    options: FootprintNormalizationOptions,
): TpoBar {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError('sschart: TPO bar must be an object');
    if (typeof value.sessionId !== 'string' || value.sessionId.trim().length === 0)
        throw new TypeError('sschart: TPO bar sessionId must be non-empty');
    const candle = normalizeTickAlignedCandle(value, options);
    return Object.freeze({ ...candle, sessionId: value.sessionId.trim() });
}

export function normalizeTpoBars(
    values: readonly TpoBar[],
    options: FootprintNormalizationOptions,
): readonly TpoBar[] {
    if (!Array.isArray(values)) throw new TypeError('sschart: TPO bars must be an array');
    normalizeFootprintBars([], options);
    const result: TpoBar[] = [];
    const completedSessions = new Set<string>();
    let previousTime = -Infinity;
    let currentSession: string | null = null;
    for (let index = 0; index < values.length; index++) {
        const bar = normalizeTpoBar(values[index], options);
        if (!(bar.time > previousTime))
            throw new RangeError(`sschart: TPO bar times must be strictly increasing (index ${index})`);
        if (bar.sessionId !== currentSession) {
            if (currentSession !== null) completedSessions.add(currentSession);
            if (completedSessions.has(bar.sessionId)) {
                throw new RangeError(
                    `sschart: TPO session '${bar.sessionId}' must occupy one contiguous span`,
                );
            }
            currentSession = bar.sessionId;
        }
        previousTime = bar.time;
        result.push(bar);
    }
    return Object.freeze(result);
}

export function tpoSymbolForPeriod(
    periodIndex: number,
    symbolSequence = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
): string {
    if (!Number.isSafeInteger(periodIndex) || periodIndex < 0)
        throw new RangeError('sschart: TPO periodIndex must be a non-negative integer');
    const symbols = normalizeSymbols(symbolSequence);
    const symbol = symbols[periodIndex % symbols.length];
    const cycle = Math.floor(periodIndex / symbols.length);
    return cycle === 0 ? symbol : `${symbol}${cycle + 1}`;
}

export function calculateTpoProfiles(
    values: readonly TpoBar[],
    options: TpoCalculationOptions,
): readonly TpoSessionProfile[] {
    const config = normalizeCalculationOptions(options);
    const bars = normalizeTpoBars(values, config);
    if (bars.length === 0) return Object.freeze([]);
    const profiles: TpoSessionProfile[] = [];
    let start = 0;
    for (let index = 1; index <= bars.length; index++) {
        if (index < bars.length && bars[index].sessionId === bars[start].sessionId) continue;
        profiles.push(calculateSession(bars.slice(start, index), config));
        start = index;
    }
    return Object.freeze(profiles);
}

function calculateSession(
    bars: readonly TpoBar[],
    options: NormalizedTpoOptions,
): TpoSessionProfile {
    const levels = new Map<number, MutableTpoLevel>();
    let initialBalanceLow = Infinity;
    let initialBalanceHigh = -Infinity;
    for (let periodIndex = 0; periodIndex < bars.length; periodIndex++) {
        const bar = bars[periodIndex];
        const lowTick = priceTick(bar.low, options);
        const highTick = priceTick(bar.high, options);
        const count = highTick - lowTick + 1;
        if (!Number.isSafeInteger(count) || count < 1 || count > options.maxLevelsPerBar) {
            throw new RangeError(
                `sschart: TPO bar at ${bar.time} spans ${count} levels; maximum is ${options.maxLevelsPerBar}`,
            );
        }
        if (periodIndex < options.initialBalancePeriods) {
            initialBalanceLow = Math.min(initialBalanceLow, bar.low);
            initialBalanceHigh = Math.max(initialBalanceHigh, bar.high);
        }
        for (let tick = lowTick; tick <= highTick; tick++) {
            let level = levels.get(tick);
            if (level === undefined) {
                level = { price: priceAtTick(tick, options), periods: [] };
                levels.set(tick, level);
            }
            level.periods.push(periodIndex);
        }
    }
    const snapshot: TpoLevel[] = Array.from(levels.values())
        .sort((left, right) => left.price - right.price)
        .map(level => {
            const periodIndexes = Object.freeze(level.periods.slice());
            return Object.freeze({
                price: level.price,
                count: periodIndexes.length,
                periodIndexes,
                symbols: Object.freeze(periodIndexes.map(index => symbolAt(index, options))),
                singlePrint: periodIndexes.length === 1,
            });
        });
    const totalTpos = checkedSum(snapshot.map(level => level.count), 'TPO total count');
    const pocIndex = selectPoc(snapshot);
    const valueArea = calculateTpoValueArea(
        snapshot,
        pocIndex,
        totalTpos,
        options.valueAreaPercentage,
    );
    return Object.freeze({
        sessionId: bars[0].sessionId,
        from: bars[0].time,
        to: bars[bars.length - 1].time,
        periodCount: bars.length,
        totalTpos,
        levels: Object.freeze(snapshot),
        pocPrice: snapshot[pocIndex].price,
        pocCount: snapshot[pocIndex].count,
        valueArea,
        initialBalanceLow,
        initialBalanceHigh,
    });
}

function selectPoc(levels: readonly TpoLevel[]): number {
    const midpoint = (levels[0].price + levels[levels.length - 1].price) / 2;
    let selected = 0;
    for (let index = 1; index < levels.length; index++) {
        const candidate = levels[index];
        const current = levels[selected];
        const candidateDistance = Math.abs(candidate.price - midpoint);
        const currentDistance = Math.abs(current.price - midpoint);
        if (candidate.count > current.count
            || (candidate.count === current.count
                && (candidateDistance < currentDistance
                    || (candidateDistance === currentDistance && candidate.price < current.price)))) {
            selected = index;
        }
    }
    return selected;
}

function calculateTpoValueArea(
    levels: readonly TpoLevel[],
    pocIndex: number,
    total: number,
    percentage: number,
): TpoValueArea {
    const targetCount = total * percentage;
    let lowIndex = pocIndex;
    let highIndex = pocIndex;
    let count = levels[pocIndex].count;
    while (count < targetCount && (lowIndex > 0 || highIndex < levels.length - 1)) {
        const lower = lowIndex > 0 ? levels[lowIndex - 1].count : -1;
        const upper = highIndex < levels.length - 1 ? levels[highIndex + 1].count : -1;
        if (lower === upper && lower >= 0) {
            lowIndex--;
            highIndex++;
            count = checkedAdd(count, lower, 'TPO value-area count');
            count = checkedAdd(count, upper, 'TPO value-area count');
        } else if (upper > lower) {
            highIndex++;
            count = checkedAdd(count, upper, 'TPO value-area count');
        } else {
            lowIndex--;
            count = checkedAdd(count, lower, 'TPO value-area count');
        }
    }
    return Object.freeze({
        low: levels[lowIndex].price,
        high: levels[highIndex].price,
        count,
        targetCount,
        percentage,
    });
}

export const TpoDisplayMode = Object.freeze({
    Auto: 'auto',
    Letters: 'letters',
    Blocks: 'blocks',
} as const);
export type TpoDisplayMode = typeof TpoDisplayMode[keyof typeof TpoDisplayMode];

export interface TpoSeriesOptions extends SeriesOptions, TpoCalculationOptions {
    readonly displayMode: TpoDisplayMode;
    readonly letterColor: string;
    readonly blockColor: string;
    readonly singlePrintColor: string;
    readonly pocColor: string;
    readonly valueAreaColor: string;
    readonly initialBalanceColor: string;
    readonly cellOpacity: number;
    readonly fontSize: number;
    readonly showPoc: boolean;
    readonly showValueArea: boolean;
    readonly showInitialBalance: boolean;
    readonly showSinglePrints: boolean;
}

const DISPLAY_MODES = new Set<TpoDisplayMode>(Object.values(TpoDisplayMode));

export const defaultTpoSeriesOptions: Readonly<TpoSeriesOptions> = Object.freeze({
    tickSize: 0.01,
    priceOrigin: 0,
    valueAreaPercentage: 0.7,
    initialBalancePeriods: 2,
    symbolSequence: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    maxLevelsPerBar: 5_000,
    displayMode: TpoDisplayMode.Auto,
    letterColor: '#cfd8dc',
    blockColor: '#4a9eff',
    singlePrintColor: '#ff9800',
    pocColor: '#f6c344',
    valueAreaColor: '#7e57c2',
    initialBalanceColor: '#26a69a',
    cellOpacity: 0.68,
    fontSize: 11,
    showPoc: true,
    showValueArea: true,
    showInitialBalance: true,
    showSinglePrints: true,
    priceLineVisible: false,
    lastValueVisible: false,
});

type TpoContext = SeriesRendererContext<TpoBar, TpoSeriesOptions>;

const profileCache = new WeakMap<TpoBar, WeakMap<TpoBar, Map<string, readonly TpoSessionProfile[]>>>();

function profilesFor(
    bars: readonly TpoBar[],
    options: Readonly<TpoSeriesOptions>,
): readonly TpoSessionProfile[] {
    if (bars.length === 0) return Object.freeze([]);
    const first = bars[0];
    const last = bars[bars.length - 1];
    let byLast = profileCache.get(first);
    if (byLast === undefined) {
        byLast = new WeakMap();
        profileCache.set(first, byLast);
    }
    let entries = byLast.get(last);
    if (entries === undefined) {
        entries = new Map();
        byLast.set(last, entries);
    }
    const key = calculationKey(bars.length, options);
    const cached = entries.get(key);
    if (cached !== undefined) return cached;
    const profiles = calculateTpoProfiles(bars, options);
    entries.set(key, profiles);
    return profiles;
}

function drawTpo(context: TpoContext): void {
    validateSeriesOptions(context.options);
    const profiles = profilesFor(context.allData, context.options);
    for (const profile of profiles) {
        if (profile.to < context.visibleTimeRange.from || profile.from > context.visibleTimeRange.to)
            continue;
        drawTpoProfile(context, profile);
    }
}

function drawTpoProfile(context: TpoContext, profile: TpoSessionProfile): void {
    const { target: ctx, options } = context;
    const fromX = context.timeToCoordinate(profile.from) - context.barSpacing / 2;
    const toX = context.timeToCoordinate(profile.to) + context.barSpacing / 2;
    const left = Math.min(fromX, toX);
    const right = Math.max(fromX, toX);
    const width = Math.max(context.barSpacing, right - left);
    const reference = profile.levels[Math.floor(profile.levels.length / 2)].price;
    const cellHeight = Math.max(1, Math.abs(
        context.priceToCoordinate(reference + options.tickSize / 2)
        - context.priceToCoordinate(reference - options.tickSize / 2),
    ));
    const periodWidth = width / profile.periodCount;
    const letters = options.displayMode === TpoDisplayMode.Letters
        || (options.displayMode === TpoDisplayMode.Auto
            && cellHeight >= options.fontSize + 1
            && periodWidth >= options.fontSize * 0.62);
    const maximum = Math.max(...profile.levels.map(level => level.count), 1);
    if (letters) {
        ctx.font = `${options.fontSize}px ${context.theme.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
    }
    for (const level of profile.levels) {
        const y = context.priceToCoordinate(level.price);
        const top = y - cellHeight / 2;
        if (options.showValueArea
            && level.price >= profile.valueArea.low
            && level.price <= profile.valueArea.high) {
            fill(ctx, options.valueAreaColor, 0.11, left, top, width, cellHeight);
        }
        if (letters) {
            ctx.fillStyle = options.showSinglePrints && level.singlePrint
                ? options.singlePrintColor : options.letterColor;
            ctx.fillText(level.symbols.join(''), left + 2, y, Math.max(0, width - 4));
        } else {
            const levelWidth = level.count / maximum * width;
            fill(ctx,
                options.showSinglePrints && level.singlePrint
                    ? options.singlePrintColor : options.blockColor,
                options.cellOpacity,
                left,
                top,
                levelWidth,
                cellHeight,
            );
        }
    }
    if (options.showPoc)
        horizontal(ctx, left, right, context.priceToCoordinate(profile.pocPrice), options.pocColor, 1.5);
    if (options.showInitialBalance) {
        horizontal(ctx, left, right, context.priceToCoordinate(profile.initialBalanceHigh),
            options.initialBalanceColor, 1);
        horizontal(ctx, left, right, context.priceToCoordinate(profile.initialBalanceLow),
            options.initialBalanceColor, 1);
    }
}

function horizontal(
    ctx: CanvasRenderingContext2D,
    left: number,
    right: number,
    y: number,
    color: string,
    width: number,
): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(left, Math.round(y) + 0.5);
    ctx.lineTo(right, Math.round(y) + 0.5);
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

function tpoPriceRange(data: readonly TpoBar[]): SeriesPriceRange | null {
    if (data.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const bar of data) {
        min = Math.min(min, bar.low);
        max = Math.max(max, bar.high);
    }
    return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

function createProcessor(): IIncrementalSeriesDataProcessor<TpoBar, TpoSeriesOptions> {
    let length = 0;
    let prefixState = emptySessionState();
    let fullState = emptySessionState();
    return {
        reset(data, options) {
            validateSeriesOptions(options);
            const normalized = normalizeTpoBars(data, options);
            length = normalized.length;
            prefixState = emptySessionState();
            for (let index = 0; index < Math.max(0, normalized.length - 1); index++)
                advanceSessionState(prefixState, normalized[index].sessionId);
            fullState = cloneSessionState(prefixState);
            if (normalized.length > 0)
                advanceSessionState(fullState, normalized[normalized.length - 1].sessionId);
            return { data: normalized };
        },
        update(point, options, kind) {
            validateSeriesOptions(options);
            const normalized = normalizeTpoBar(point, options);
            const fromIndex = kind === 'append' ? length : Math.max(0, length - 1);
            if (kind === 'append') {
                const nextPrefix = cloneSessionState(fullState);
                const next = cloneSessionState(fullState);
                advanceSessionState(next, normalized.sessionId);
                prefixState = nextPrefix;
                fullState = next;
                length++;
            } else {
                const next = cloneSessionState(prefixState);
                advanceSessionState(next, normalized.sessionId);
                fullState = next;
            }
            return Object.freeze({
                fromIndex,
                removed: kind === 'append' ? 0 : 1,
                data: Object.freeze([normalized]),
            });
        },
    };
}

interface SessionSequenceState {
    active: string | null;
    readonly completed: Set<string>;
}

function emptySessionState(): SessionSequenceState {
    return { active: null, completed: new Set() };
}

function cloneSessionState(value: SessionSequenceState): SessionSequenceState {
    return { active: value.active, completed: new Set(value.completed) };
}

function advanceSessionState(value: SessionSequenceState, sessionId: string): void {
    if (sessionId === value.active) return;
    if (value.active !== null) value.completed.add(value.active);
    if (value.completed.has(sessionId))
        throw new RangeError(`sschart: TPO session '${sessionId}' must occupy one contiguous span`);
    value.active = sessionId;
}

function calculationKey(length: number, options: Readonly<TpoSeriesOptions>): string {
    return [
        length,
        options.tickSize,
        options.priceOrigin ?? 0,
        options.valueAreaPercentage ?? 0.7,
        options.initialBalancePeriods ?? 2,
        options.symbolSequence ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
        options.maxLevelsPerBar ?? 5_000,
    ].join('|');
}

function symbolAt(index: number, options: NormalizedTpoOptions): string {
    const symbol = options.symbols[index % options.symbols.length];
    const cycle = Math.floor(index / options.symbols.length);
    return cycle === 0 ? symbol : `${symbol}${cycle + 1}`;
}

function priceTick(price: number, options: NormalizedTpoOptions): number {
    const result = Math.round((price - options.priceOrigin) / options.tickSize);
    if (!Number.isSafeInteger(result))
        throw new RangeError('sschart: TPO price tick index exceeds safe integer range');
    return result;
}

function priceAtTick(index: number, options: NormalizedTpoOptions): number {
    const result = options.priceOrigin + index * options.tickSize;
    return Object.is(result, -0) ? 0 : result;
}

function checkedSum(values: readonly number[], name: string): number {
    let result = 0;
    for (const value of values) result = checkedAdd(result, value, name);
    return result;
}

function checkedAdd(left: number, right: number, name: string): number {
    const result = left + right;
    if (!Number.isSafeInteger(result)) throw new RangeError(`sschart: ${name} overflow`);
    return result;
}

function normalizeCalculationOptions(value: TpoCalculationOptions): NormalizedTpoOptions {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError('sschart: TPO calculation options are required');
    normalizeFootprintBars([], value);
    const valueAreaPercentage = value.valueAreaPercentage ?? 0.7;
    finite(valueAreaPercentage, 'TPO valueAreaPercentage');
    if (!(valueAreaPercentage > 0 && valueAreaPercentage <= 1))
        throw new RangeError('sschart: TPO valueAreaPercentage must be in (0, 1]');
    const initialBalancePeriods = positiveInteger(
        value.initialBalancePeriods ?? 2,
        'TPO initialBalancePeriods',
    );
    const symbolSequence = value.symbolSequence ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const symbols = normalizeSymbols(symbolSequence);
    const maxLevelsPerBar = positiveInteger(value.maxLevelsPerBar ?? 5_000, 'TPO maxLevelsPerBar');
    return Object.freeze({
        tickSize: value.tickSize,
        priceOrigin: value.priceOrigin ?? 0,
        valueAreaPercentage,
        initialBalancePeriods,
        symbolSequence,
        symbols,
        maxLevelsPerBar,
    });
}

function normalizeSymbols(value: unknown): readonly string[] {
    if (typeof value !== 'string' || value.length === 0)
        throw new TypeError('sschart: TPO symbolSequence must be non-empty');
    const symbols = Array.from(value);
    if (symbols.some(symbol => symbol.trim().length === 0))
        throw new TypeError('sschart: TPO symbolSequence cannot contain whitespace');
    if (new Set(symbols).size !== symbols.length)
        throw new RangeError('sschart: TPO symbolSequence symbols must be unique');
    return Object.freeze(symbols);
}

function validateSeriesOptions(options: Readonly<TpoSeriesOptions>): void {
    normalizeCalculationOptions(options);
    if (!DISPLAY_MODES.has(options.displayMode))
        throw new TypeError('sschart: TPO displayMode is invalid');
    unit(options.cellOpacity, 'TPO cellOpacity');
    positive(options.fontSize, 'TPO fontSize');
    for (const key of [
        'letterColor', 'blockColor', 'singlePrintColor', 'pocColor',
        'valueAreaColor', 'initialBalanceColor',
    ] as const) {
        if (typeof options[key] !== 'string' || options[key].trim().length === 0)
            throw new TypeError(`sschart: TPO ${key} must be non-empty`);
    }
    for (const key of [
        'showPoc', 'showValueArea', 'showInitialBalance', 'showSinglePrints',
    ] as const) {
        if (typeof options[key] !== 'boolean')
            throw new TypeError(`sschart: TPO ${key} must be boolean`);
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

function positiveInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1)
        throw new RangeError(`sschart: ${name} must be a positive integer`);
    return value as number;
}

function unit(value: unknown, name: string): number {
    const result = finite(value, name);
    if (result < 0 || result > 1) throw new RangeError(`sschart: ${name} must be in [0, 1]`);
    return result;
}

export const TpoSeries: CustomSeriesDefinition<TpoBar, TpoSeriesOptions> = Object.freeze({
    type: 'TPO',
    defaultOptions: defaultTpoSeriesOptions,
    renderer: Object.freeze({
        dataPadding: 0,
        drawOutsideVisibleRange: true,
        draw: drawTpo,
        priceRange: tpoPriceRange,
        priceValue: (bar: TpoBar) => bar.close,
        colorAt: (_bar: TpoBar, options: Readonly<TpoSeriesOptions>) => options.blockColor,
        magnetValues: (bar: TpoBar) => [bar.open, bar.high, bar.low, bar.close],
    }),
    incrementalDataProcessorFactory: createProcessor,
});
