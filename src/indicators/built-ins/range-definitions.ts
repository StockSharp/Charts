import {
    CandlestickIndicatorInput,
    IndicatorCategory,
    IndicatorMeasure,
    IndicatorPane,
    IndicatorParameterType,
    IndicatorSeriesStyle,
    type IndicatorCandle,
    type IndicatorDefinition,
    type IndicatorParameters,
    type IndicatorProcessInput,
} from '../indicator-definition.js';
import { registerIndicator } from '../indicator-registry.js';
import {
    SequentialIndicatorProcessor,
    type IndicatorCalculationResult,
} from '../sequential-processor.js';
import {
    ExponentialMovingAverage,
    PartialSeedSimpleMovingAverage,
    RingBuffer,
    RollingMaximum,
    RollingMinimum,
    RollingSum,
    SimpleMovingAverage,
    type RingBufferCheckpoint,
    type RollingWindowCheckpoint,
    type SeededMovingAverageCheckpoint,
} from '../math/index.js';

export interface RangeLengthParameters extends IndicatorParameters {
    readonly length: number;
}

export interface AroonCheckpoint {
    readonly highs: readonly number[];
    readonly lows: readonly number[];
    readonly maximum: number;
    readonly maximumAge: number;
    readonly minimum: number;
    readonly minimumAge: number;
}

export interface ChoppinessIndexCheckpoint {
    readonly highLowRanges: RingBufferCheckpoint<number>;
    readonly trueRanges: RingBufferCheckpoint<number>;
    readonly previousClose: number;
}

export interface ChandeKrollStopParameters extends IndicatorParameters {
    readonly period: number;
    readonly multiplier: number;
    readonly stopPeriod: number;
}

export interface ChandeKrollStopCheckpoint {
    readonly highest: RollingWindowCheckpoint;
    readonly lowest: RollingWindowCheckpoint;
    readonly longAverage: RingBufferCheckpoint<number>;
    readonly shortAverage: RingBufferCheckpoint<number>;
}

export interface FibonacciRetracementCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}

export interface VerticalHorizontalFilterCheckpoint {
    readonly previousClose: number | null;
    readonly highest: RollingWindowCheckpoint;
    readonly lowest: RollingWindowCheckpoint;
    readonly movement: RollingWindowCheckpoint;
}

export interface VortexIndicatorCheckpoint {
    readonly previousHigh: number | null;
    readonly previousLow: number | null;
    readonly previousClose: number | null;
    readonly trueRange: RollingWindowCheckpoint;
    readonly positiveMovement: RollingWindowCheckpoint;
    readonly negativeMovement: RollingWindowCheckpoint;
}

const FIBONACCI_LEVELS = Object.freeze([
    { id: 'l236', name: '23.6%', ratio: 0.236, color: '#ef5350' },
    { id: 'l382', name: '38.2%', ratio: 0.382, color: '#ffb74d' },
    { id: 'l500', name: '50.0%', ratio: 0.5, color: '#ffee58' },
    { id: 'l618', name: '61.8%', ratio: 0.618, color: '#66bb6a' },
    { id: 'l786', name: '78.6%', ratio: 0.786, color: '#42a5f5' },
] as const);

interface AroonValue {
    readonly up: number | null;
    readonly down: number | null;
}

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function length(value: unknown, fallback: number): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || (resolved as number) < 1 || (resolved as number) > 500)
        throw new RangeError('sschart: indicator length must be an integer from 1 to 500');
    return resolved as number;
}

function number(
    value: unknown,
    fallback: number,
    minimum: number,
    maximum: number,
    name: string,
): number {
    const resolved = value ?? fallback;
    if (typeof resolved !== 'number' || !Number.isFinite(resolved)
        || resolved < minimum || resolved > maximum) {
        throw new RangeError(
            `sschart: indicator ${name} must be finite from ${minimum} to ${maximum}`,
        );
    }
    return resolved;
}

function lineStyle(color: string, lineWidth = 2) {
    return {
        series: IndicatorSeriesStyle.Line,
        color,
        lineWidth,
        options: { priceLineVisible: false },
    } as const;
}

/** Exact bounded-state port of StockSharp Aroon's eviction/rescan semantics. */
class AroonKernel {
    private readonly highs: RingBuffer<number>;
    private readonly lows: RingBuffer<number>;
    private maximum = -Infinity;
    private maximumAge = 0;
    private minimum = Infinity;
    private minimumAge = 0;

    constructor(readonly windowLength: number) {
        length(windowLength, windowLength);
        this.highs = new RingBuffer(windowLength);
        this.lows = new RingBuffer(windowLength);
    }

    push(high: number | null, low: number | null): AroonValue {
        return this.evaluate(high, low, true);
    }

    preview(high: number | null, low: number | null): AroonValue {
        return this.evaluate(high, low, false);
    }

    reset(): void {
        this.highs.clear();
        this.lows.clear();
        this.maximum = -Infinity;
        this.maximumAge = 0;
        this.minimum = Infinity;
        this.minimumAge = 0;
    }

    checkpoint(): AroonCheckpoint {
        return Object.freeze({
            highs: Object.freeze(this.highs.toArray()),
            lows: Object.freeze(this.lows.toArray()),
            maximum: this.maximum,
            maximumAge: this.maximumAge,
            minimum: this.minimum,
            minimumAge: this.minimumAge,
        });
    }

    restore(state: AroonCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.highs) || !Array.isArray(state.lows)
            || state.highs.length !== state.lows.length
            || state.highs.length > this.windowLength
            || !state.highs.every((item) => finite(item) !== null)
            || !state.lows.every((item) => finite(item) !== null)
            || !Number.isInteger(state.maximumAge) || state.maximumAge < 0
            || !Number.isInteger(state.minimumAge) || state.minimumAge < 0
            || (state.highs.length === 0
                ? state.maximum !== -Infinity || state.minimum !== Infinity
                : finite(state.maximum) === null || finite(state.minimum) === null)) {
            throw new TypeError('sschart: invalid Aroon checkpoint');
        }
        this.highs.restore({ values: state.highs });
        this.lows.restore({ values: state.lows });
        this.maximum = state.maximum;
        this.maximumAge = state.maximumAge;
        this.minimum = state.minimum;
        this.minimumAge = state.minimumAge;
    }

    private evaluate(high: number | null, low: number | null, commit: boolean): AroonValue {
        if (high === null || low === null) return { up: null, down: null };

        let maximum = this.maximum;
        let maximumAge = this.maximumAge;
        let minimum = this.minimum;
        let minimumAge = this.minimumAge;

        if (high >= maximum) {
            maximum = high;
            maximumAge = 0;
        } else maximumAge += 1;
        if (low <= minimum) {
            minimum = low;
            minimumAge = 0;
        } else minimumAge += 1;

        const full = this.highs.full;
        if (full) {
            if (this.highs.front() === maximum) {
                maximum = high;
                maximumAge = 0;
                for (let index = 1; index < this.windowLength; index += 1) {
                    const candidate = this.highs.at(index)!;
                    if (candidate > maximum) {
                        maximum = candidate;
                        maximumAge = index;
                    }
                }
            }
            if (this.lows.front() === minimum) {
                minimum = low;
                minimumAge = 0;
                for (let index = 1; index < this.windowLength; index += 1) {
                    const candidate = this.lows.at(index)!;
                    if (candidate < minimum) {
                        minimum = candidate;
                        minimumAge = index;
                    }
                }
            }
        }

        const formed = full || this.highs.size + 1 === this.windowLength;
        if (commit) {
            this.highs.push(high);
            this.lows.push(low);
            this.maximum = maximum;
            this.maximumAge = maximumAge;
            this.minimum = minimum;
            this.minimumAge = minimumAge;
        }
        return formed
            ? {
                up: 100 * (this.windowLength - maximumAge) / this.windowLength,
                down: 100 * (this.windowLength - minimumAge) / this.windowLength,
            }
            : { up: null, down: null };
    }
}

export class AroonProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    AroonCheckpoint
> {
    private readonly aroon: AroonKernel;

    constructor(readonly length: number) {
        super(['up', 'down']);
        this.aroon = new AroonKernel(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const value = commit
            ? this.aroon.push(high, low)
            : this.aroon.preview(high, low);
        return {
            isFormed: value.up !== null && value.down !== null,
            values: [
                this.output('up', value.up, input.index),
                this.output('down', value.down, input.index),
            ],
        };
    }

    protected resetState(): void { this.aroon.reset(); }
    protected captureState(): AroonCheckpoint { return this.aroon.checkpoint(); }
    protected restoreState(state: AroonCheckpoint): void { this.aroon.restore(state); }
}

export class AroonOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    AroonCheckpoint
> {
    private readonly aroon: AroonKernel;

    constructor(readonly length: number) {
        super(['line']);
        this.aroon = new AroonKernel(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const aroon = commit
            ? this.aroon.push(high, low)
            : this.aroon.preview(high, low);
        const value = aroon.up === null || aroon.down === null
            ? null
            : aroon.up - aroon.down;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.aroon.reset(); }
    protected captureState(): AroonCheckpoint { return this.aroon.checkpoint(); }
    protected restoreState(state: AroonCheckpoint): void { this.aroon.restore(state); }
}

export class BalanceOfPowerProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    null
> {
    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        _commit: boolean,
    ): IndicatorCalculationResult {
        const open = finite(input.value?.open);
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        let value: number | null = null;
        if (open !== null && high !== null && low !== null && close !== null) {
            const range = high - low;
            if (range !== 0) {
                const raw = (close - open) / range;
                if (Number.isFinite(raw)) value = Math.max(-1, Math.min(1, raw));
            }
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {}
    protected captureState(): null { return null; }
    protected restoreState(state: null): void {
        if (state !== null) throw new TypeError('sschart: invalid Balance of Power checkpoint');
    }
}

export class BalanceOfMarketPowerProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly average: SimpleMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        this.average = new SimpleMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const open = finite(input.value?.open);
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        let raw: number | null = null;
        if (open !== null && high !== null && low !== null && close !== null) {
            const volume = finite(input.value?.volume) ?? 0;
            raw = volume === 0
                ? 0
                : (close - open) / (high === low ? 0.01 : high - low);
            if (!Number.isFinite(raw)) raw = null;
        }
        const value = commit ? this.average.push(raw) : this.average.preview(raw);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void { this.average.restore(state); }
}

export class ChoppinessIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ChoppinessIndexCheckpoint
> {
    private readonly highLowRanges: RingBuffer<number>;
    private readonly trueRanges: RingBuffer<number>;
    private readonly logarithm: number;
    private sumHighLowRange = 0;
    private sumTrueRange = 0;
    private previousClose = 0;

    constructor(readonly length: number) {
        super(['line']);
        this.highLowRanges = new RingBuffer(length);
        this.trueRanges = new RingBuffer(length);
        this.logarithm = Math.log10(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        if (high === null || low === null || close === null) {
            return {
                isFormed: this.highLowRanges.full,
                values: [this.output('line', null, input.index)],
            };
        }

        const highLowRange = high - low;
        const trueRange = Math.max(
            highLowRange,
            Math.abs(high - this.previousClose),
            Math.abs(low - this.previousClose),
        );
        let sumHighLowRange = this.sumHighLowRange;
        let sumTrueRange = this.sumTrueRange;
        if (this.highLowRanges.full) {
            sumHighLowRange -= this.highLowRanges.front()!;
            sumTrueRange -= this.trueRanges.front()!;
        }
        sumHighLowRange += highLowRange;
        sumTrueRange += trueRange;
        const formed = this.highLowRanges.full
            || this.highLowRanges.size + 1 === this.length;

        let value: number | null = null;
        if (formed && this.logarithm !== 0
            && sumTrueRange > 0 && sumHighLowRange > 0) {
            const ratio = sumTrueRange / sumHighLowRange;
            const candidate = ratio > 0
                ? 100 * Math.log10(ratio) / this.logarithm
                : Number.NaN;
            if (Number.isFinite(candidate)) value = candidate;
        }

        if (commit) {
            this.highLowRanges.push(highLowRange);
            this.trueRanges.push(trueRange);
            this.sumHighLowRange = sumHighLowRange;
            this.sumTrueRange = sumTrueRange;
            this.previousClose = close;
        }
        return {
            isFormed: formed,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.highLowRanges.clear();
        this.trueRanges.clear();
        this.sumHighLowRange = 0;
        this.sumTrueRange = 0;
        this.previousClose = 0;
    }

    protected captureState(): ChoppinessIndexCheckpoint {
        return Object.freeze({
            highLowRanges: this.highLowRanges.checkpoint(),
            trueRanges: this.trueRanges.checkpoint(),
            previousClose: this.previousClose,
        });
    }

    protected restoreState(state: ChoppinessIndexCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.highLowRanges?.values)
            || !Array.isArray(state.trueRanges?.values)
            || state.highLowRanges.values.length !== state.trueRanges.values.length
            || state.highLowRanges.values.length > this.length
            || state.highLowRanges.values.some((value) => finite(value) === null)
            || state.trueRanges.values.some((value) => finite(value) === null)
            || finite(state.previousClose) === null
            || (state.highLowRanges.values.length === 0 && state.previousClose !== 0)) {
            throw new TypeError('sschart: invalid Choppiness Index checkpoint');
        }
        this.highLowRanges.restore(state.highLowRanges);
        this.trueRanges.restore(state.trueRanges);
        this.sumHighLowRange = state.highLowRanges.values.reduce((sum, value) => sum + value, 0);
        this.sumTrueRange = state.trueRanges.values.reduce((sum, value) => sum + value, 0);
        this.previousClose = state.previousClose;
    }
}

export class ChandeKrollStopProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ChandeKrollStopCheckpoint
> {
    private readonly highest: RollingMaximum;
    private readonly lowest: RollingMinimum;
    private readonly longAverage: PartialSeedSimpleMovingAverage;
    private readonly shortAverage: PartialSeedSimpleMovingAverage;

    constructor(
        readonly period: number,
        readonly multiplier: number,
        readonly stopPeriod: number,
    ) {
        super(['longStop', 'shortStop']);
        length(period, period);
        number(multiplier, multiplier, 0.001, 30, 'multiplier');
        length(stopPeriod, stopPeriod);
        this.highest = new RollingMaximum(period);
        this.lowest = new RollingMinimum(period);
        this.longAverage = new PartialSeedSimpleMovingAverage(stopPeriod);
        this.shortAverage = new PartialSeedSimpleMovingAverage(stopPeriod);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const highest = commit ? this.highest.push(high) : this.highest.preview(high);
        const lowest = commit ? this.lowest.push(low) : this.lowest.preview(low);
        if (highest === null || lowest === null) {
            return {
                isFormed: false,
                values: [
                    this.output('longStop', null, input.index),
                    this.output('shortStop', null, input.index),
                ],
            };
        }

        const difference = highest - lowest;
        const rawLong = highest - difference * this.multiplier;
        const rawShort = lowest + difference * this.multiplier;
        const longStop = commit
            ? this.longAverage.push(rawLong)
            : this.longAverage.preview(rawLong);
        const shortStop = commit
            ? this.shortAverage.push(rawShort)
            : this.shortAverage.preview(rawShort);
        const formed = longStop !== null && shortStop !== null;
        return {
            isFormed: formed,
            values: [
                this.output('longStop', formed ? longStop : null, input.index),
                this.output('shortStop', formed ? shortStop : null, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.highest.reset();
        this.lowest.reset();
        this.longAverage.reset();
        this.shortAverage.reset();
    }

    protected captureState(): ChandeKrollStopCheckpoint {
        return Object.freeze({
            highest: this.highest.checkpoint(),
            lowest: this.lowest.checkpoint(),
            longAverage: this.longAverage.checkpoint(),
            shortAverage: this.shortAverage.checkpoint(),
        });
    }

    protected restoreState(state: ChandeKrollStopCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || state.highest?.values?.length !== state.lowest?.values?.length
            || state.longAverage?.values?.length !== state.shortAverage?.values?.length) {
            throw new TypeError('sschart: invalid Chande Kroll Stop checkpoint');
        }
        this.highest.restore(state.highest);
        this.lowest.restore(state.lowest);
        this.longAverage.restore(state.longAverage);
        this.shortAverage.restore(state.shortAverage);
    }
}

export class BearPowerProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    SeededMovingAverageCheckpoint
> {
    private readonly average: ExponentialMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        this.average = new ExponentialMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const low = finite(input.value?.low);
        const average = commit ? this.average.push(close) : this.average.preview(close);
        const value = average === null || low === null ? null : low - average;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): SeededMovingAverageCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: SeededMovingAverageCheckpoint): void { this.average.restore(state); }
}

export class BullPowerProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    SeededMovingAverageCheckpoint
> {
    private readonly average: ExponentialMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        this.average = new ExponentialMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const high = finite(input.value?.high);
        const average = commit ? this.average.push(close) : this.average.preview(close);
        const value = average === null || high === null ? null : high - average;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): SeededMovingAverageCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: SeededMovingAverageCheckpoint): void { this.average.restore(state); }
}

export class ElderRayProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    SeededMovingAverageCheckpoint
> {
    private readonly average: ExponentialMovingAverage;

    constructor(readonly length: number) {
        super(['bull', 'bear']);
        this.average = new ExponentialMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const average = commit ? this.average.push(close) : this.average.preview(close);
        const bull = average === null || high === null ? null : finite(high - average);
        const bear = average === null || low === null ? null : finite(low - average);
        return {
            isFormed: bull !== null && bear !== null,
            values: [
                this.output('bull', bull, input.index),
                this.output('bear', bear, input.index),
            ],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): SeededMovingAverageCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: SeededMovingAverageCheckpoint): void {
        this.average.restore(state);
    }
}

export class FibonacciRetracementProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    FibonacciRetracementCheckpoint
> {
    private readonly high: RollingMaximum;
    private readonly low: RollingMinimum;

    constructor(readonly length: number) {
        super(FIBONACCI_LEVELS.map((level) => level.id));
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Fibonacci Retracement length must be an integer from 1 to 500',
            );
        }
        this.high = new RollingMaximum(length);
        this.low = new RollingMinimum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        let maximum: number | null;
        let minimum: number | null;
        if (commit) {
            this.high.push(finite(input.value?.high));
            this.low.push(finite(input.value?.low));
            maximum = this.high.partialValue;
            minimum = this.low.partialValue;
        } else {
            maximum = this.high.previewPartial(finite(input.value?.high));
            minimum = this.low.previewPartial(finite(input.value?.low));
        }

        const formed = maximum !== null && minimum !== null;
        const upper = maximum ?? 0;
        const lower = minimum ?? 0;
        const range = upper - lower;
        return {
            isFormed: formed,
            values: FIBONACCI_LEVELS.map((level) => this.output(
                level.id,
                formed ? lower + range * level.ratio : null,
                input.index,
            )),
        };
    }

    protected resetState(): void {
        this.high.reset();
        this.low.reset();
    }

    protected captureState(): FibonacciRetracementCheckpoint {
        return Object.freeze({
            high: this.high.checkpoint(),
            low: this.low.checkpoint(),
        });
    }

    protected restoreState(state: FibonacciRetracementCheckpoint): void {
        const valid = (checkpoint: RollingWindowCheckpoint) => (
            checkpoint !== null
            && typeof checkpoint === 'object'
            && Array.isArray(checkpoint.values)
            && checkpoint.values.length <= this.length
            && checkpoint.values.every((value) => value === null || finite(value) !== null)
        );
        if (state === null || typeof state !== 'object'
            || !valid(state.high) || !valid(state.low)
            || state.high.values.length !== state.low.values.length) {
            throw new TypeError('sschart: invalid Fibonacci Retracement checkpoint');
        }
        this.high.restore(state.high);
        this.low.restore(state.low);
    }
}

export class VerticalHorizontalFilterProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    VerticalHorizontalFilterCheckpoint
> {
    private previousClose: number | null = null;
    private readonly highest: RollingMaximum;
    private readonly lowest: RollingMinimum;
    private readonly movement: RollingSum;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500)
            throw new RangeError('sschart: indicator length must be an integer from 1 to 500');
        this.highest = new RollingMaximum(length);
        this.lowest = new RollingMinimum(length);
        this.movement = new RollingSum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const change = close === null || this.previousClose === null
            ? null
            : Math.abs(close - this.previousClose);
        const highest = commit ? this.highest.push(high) : this.highest.preview(high);
        const lowest = commit ? this.lowest.push(low) : this.lowest.preview(low);
        const movement = commit ? this.movement.push(change) : this.movement.preview(change);
        if (commit) this.previousClose = close;

        const formed = highest !== null && lowest !== null && movement !== null;
        const value = !formed || movement === 0
            ? null
            : finite((highest - lowest) / movement);
        return {
            isFormed: formed,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.previousClose = null;
        this.highest.reset();
        this.lowest.reset();
        this.movement.reset();
    }

    protected captureState(): VerticalHorizontalFilterCheckpoint {
        return Object.freeze({
            previousClose: this.previousClose,
            highest: this.highest.checkpoint(),
            lowest: this.lowest.checkpoint(),
            movement: this.movement.checkpoint(),
        });
    }

    protected restoreState(state: VerticalHorizontalFilterCheckpoint): void {
        const valid = (checkpoint: RollingWindowCheckpoint) => (
            checkpoint !== null
            && typeof checkpoint === 'object'
            && Array.isArray(checkpoint.values)
            && checkpoint.values.length <= this.length
            && checkpoint.values.every((value) => value === null || finite(value) !== null)
        );
        if (state === null || typeof state !== 'object'
            || (state.previousClose !== null && finite(state.previousClose) === null)
            || !valid(state.highest) || !valid(state.lowest) || !valid(state.movement)
            || state.highest.values.length !== state.lowest.values.length
            || state.highest.values.length !== state.movement.values.length) {
            throw new TypeError('sschart: invalid Vertical Horizontal Filter checkpoint');
        }
        this.highest.restore(state.highest);
        this.lowest.restore(state.lowest);
        this.movement.restore(state.movement);
        this.previousClose = state.previousClose;
    }
}

export class VortexIndicatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    VortexIndicatorCheckpoint
> {
    private previousHigh: number | null = null;
    private previousLow: number | null = null;
    private previousClose: number | null = null;
    private readonly trueRange: RollingSum;
    private readonly positiveMovement: RollingSum;
    private readonly negativeMovement: RollingSum;

    constructor(readonly length: number) {
        super(['viPlus', 'viMinus']);
        if (!Number.isInteger(length) || length < 1 || length > 500)
            throw new RangeError('sschart: indicator length must be an integer from 1 to 500');
        this.trueRange = new RollingSum(length);
        this.positiveMovement = new RollingSum(length);
        this.negativeMovement = new RollingSum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const seeded = this.previousClose !== null && this.previousClose !== 0
            && this.previousHigh !== null && this.previousLow !== null;
        const trueRange = !seeded || high === null || low === null
            ? null
            : Math.max(
                high - low,
                Math.abs(high - this.previousClose!),
                Math.abs(low - this.previousClose!),
            );
        const positiveMovement = !seeded || high === null || low === null
            ? null
            : Math.abs(high - this.previousLow!);
        const negativeMovement = !seeded || high === null || low === null
            ? null
            : Math.abs(low - this.previousHigh!);
        const trueRangeSum = commit
            ? this.trueRange.push(trueRange)
            : this.trueRange.preview(trueRange);
        const positiveSum = commit
            ? this.positiveMovement.push(positiveMovement)
            : this.positiveMovement.preview(positiveMovement);
        const negativeSum = commit
            ? this.negativeMovement.push(negativeMovement)
            : this.negativeMovement.preview(negativeMovement);
        if (commit) {
            this.previousHigh = high;
            this.previousLow = low;
            this.previousClose = close;
        }

        const formed = trueRangeSum !== null && positiveSum !== null && negativeSum !== null;
        const viPlus = !formed ? null : trueRangeSum === 0 ? 0 : positiveSum / trueRangeSum;
        const viMinus = !formed ? null : trueRangeSum === 0 ? 0 : negativeSum / trueRangeSum;
        return {
            isFormed: formed,
            values: [
                this.output('viPlus', viPlus, input.index),
                this.output('viMinus', viMinus, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.previousHigh = null;
        this.previousLow = null;
        this.previousClose = null;
        this.trueRange.reset();
        this.positiveMovement.reset();
        this.negativeMovement.reset();
    }

    protected captureState(): VortexIndicatorCheckpoint {
        return Object.freeze({
            previousHigh: this.previousHigh,
            previousLow: this.previousLow,
            previousClose: this.previousClose,
            trueRange: this.trueRange.checkpoint(),
            positiveMovement: this.positiveMovement.checkpoint(),
            negativeMovement: this.negativeMovement.checkpoint(),
        });
    }

    protected restoreState(state: VortexIndicatorCheckpoint): void {
        const validNumber = (value: number | null) => value === null || finite(value) !== null;
        const validWindow = (checkpoint: RollingWindowCheckpoint) => (
            checkpoint !== null
            && typeof checkpoint === 'object'
            && Array.isArray(checkpoint.values)
            && checkpoint.values.length <= this.length
            && checkpoint.values.every((value) => value === null || finite(value) !== null)
        );
        if (state === null || typeof state !== 'object'
            || !validNumber(state.previousHigh) || !validNumber(state.previousLow)
            || !validNumber(state.previousClose)
            || !validWindow(state.trueRange) || !validWindow(state.positiveMovement)
            || !validWindow(state.negativeMovement)
            || state.trueRange.values.length !== state.positiveMovement.values.length
            || state.trueRange.values.length !== state.negativeMovement.values.length) {
            throw new TypeError('sschart: invalid Vortex Indicator checkpoint');
        }
        this.trueRange.restore(state.trueRange);
        this.positiveMovement.restore(state.positiveMovement);
        this.negativeMovement.restore(state.negativeMovement);
        this.previousHigh = state.previousHigh;
        this.previousLow = state.previousLow;
        this.previousClose = state.previousClose;
    }
}

export const AroonIndicator: IndicatorDefinition<
    IndicatorCandle,
    RangeLengthParameters
> = registerIndicator({
    id: 'Aroon',
    name: 'Aroon',
    description: 'Recency of the latest high and low using StockSharp eviction semantics.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 14, min: 1, max: 500, step: 1,
    }],
    outputs: [
        { id: 'up', name: 'Aroon Up', defaultStyle: lineStyle('#00c853') },
        { id: 'down', name: 'Aroon Down', defaultStyle: lineStyle('#ff3d57') },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new AroonProcessor(length(parameters?.length, 14)),
});

export const AroonOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    RangeLengthParameters
> = registerIndicator({
    id: 'AroonOscillator',
    name: 'Aroon Oscillator',
    description: 'Difference between Aroon Up and Aroon Down on one shared state.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 14, min: 1, max: 500, step: 1,
    }],
    outputs: [{ id: 'line', name: 'Aroon Oscillator', defaultStyle: lineStyle('#7e57c2') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new AroonOscillatorProcessor(
        length(parameters?.length, 14),
    ),
});

export const BalanceOfPowerIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'BalanceOfPower',
    name: 'Balance Of Power',
    description: 'Close-to-open movement normalized by the full candle range.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'Balance Of Power', defaultStyle: lineStyle('#26a69a') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: () => new BalanceOfPowerProcessor(),
});

export const BearPowerIndicator: IndicatorDefinition<
    IndicatorCandle,
    RangeLengthParameters
> = registerIndicator({
    id: 'BearPower',
    name: 'Bear Power',
    description: 'Candle low minus the seeded exponential average of closing prices.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 13, min: 1, max: 500, step: 1,
    }],
    outputs: [{ id: 'line', name: 'Bear Power', defaultStyle: lineStyle('#ef5350') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: (parameters) => new BearPowerProcessor(length(parameters?.length, 13)),
});

export const BullPowerIndicator: IndicatorDefinition<
    IndicatorCandle,
    RangeLengthParameters
> = registerIndicator({
    id: 'BullPower',
    name: 'Bull Power',
    description: 'Candle high minus the seeded exponential average of closing prices.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 13, min: 1, max: 500, step: 1,
    }],
    outputs: [{ id: 'line', name: 'Bull Power', defaultStyle: lineStyle('#26a69a') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: (parameters) => new BullPowerProcessor(length(parameters?.length, 13)),
});

export const BalanceOfMarketPowerIndicator: IndicatorDefinition<
    IndicatorCandle,
    RangeLengthParameters
> = registerIndicator({
    id: 'BalanceOfMarketPower',
    name: 'Balance Of Market Power',
    description: 'Simple average of candle body power normalized by range and gated by volume.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 14, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line', name: 'Balance Of Market Power',
        defaultStyle: lineStyle('#5c6bc0'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new BalanceOfMarketPowerProcessor(
        length(parameters?.length, 14),
    ),
});

export const ChoppinessIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    RangeLengthParameters
> = registerIndicator({
    id: 'ChoppinessIndex',
    name: 'Choppiness Index',
    description: 'Log-scaled ratio of rolling true range to summed candle ranges.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 14, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line', name: 'Choppiness Index',
        defaultStyle: lineStyle('#ab47bc'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new ChoppinessIndexProcessor(
        length(parameters?.length, 14),
    ),
});

export const ChandeKrollStopIndicator: IndicatorDefinition<
    IndicatorCandle,
    ChandeKrollStopParameters
> = registerIndicator({
    id: 'ChandeKrollStop',
    name: 'Chande Kroll Stop',
    description: 'Range-adaptive long and short trailing-stop lines with partial-seed smoothing.',
    category: IndicatorCategory.SupportResistance,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'period', name: 'Period', type: IndicatorParameterType.Integer,
            defaultValue: 10, min: 1, max: 500, step: 1,
        },
        {
            id: 'multiplier', name: 'Multiplier', type: IndicatorParameterType.Number,
            defaultValue: 1.5, min: 0.001, max: 30, step: 0.001,
        },
        {
            id: 'stopPeriod', name: 'Stop Period', type: IndicatorParameterType.Integer,
            defaultValue: 9, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [
        {
            id: 'longStop', name: 'Long Stop',
            defaultStyle: lineStyle('#26a69a'),
        },
        {
            id: 'shortStop', name: 'Short Stop',
            defaultStyle: lineStyle('#ef5350'),
        },
    ],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new ChandeKrollStopProcessor(
        length(parameters?.period, 10),
        number(parameters?.multiplier, 1.5, 0.001, 30, 'multiplier'),
        length(parameters?.stopPeriod, 9),
    ),
});

export const ElderRayIndicator: IndicatorDefinition<
    IndicatorCandle,
    RangeLengthParameters
> = registerIndicator({
    id: 'ElderRay',
    name: 'Elder Ray',
    description: 'Bull and bear power around a shared exponential moving average.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 13, min: 1, max: 500, step: 1,
    }],
    outputs: [
        {
            id: 'bull', name: 'Bull Power',
            defaultStyle: lineStyle('#26a69a'),
        },
        {
            id: 'bear', name: 'Bear Power',
            defaultStyle: lineStyle('#ef5350'),
        },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new ElderRayProcessor(
        length(parameters?.length, 13),
    ),
});

export const FibonacciRetracementIndicator: IndicatorDefinition<
    IndicatorCandle,
    RangeLengthParameters
> = registerIndicator({
    id: 'FibonacciRetracement',
    name: 'Fibonacci Retracement',
    description: 'Five retracement prices between the rolling low and high.',
    category: IndicatorCategory.SupportResistance,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 20, min: 1, max: 500, step: 1,
    }],
    outputs: FIBONACCI_LEVELS.map((level) => ({
        id: level.id,
        name: level.name,
        defaultStyle: lineStyle(level.color, 1),
    })),
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new FibonacciRetracementProcessor(
        length(parameters?.length, 20),
    ),
});

export const VerticalHorizontalFilterIndicator: IndicatorDefinition<
    IndicatorCandle,
    RangeLengthParameters
> = registerIndicator({
    id: 'VerticalHorizontalFilter',
    name: 'Vertical Horizontal Filter',
    description: 'Price range divided by total absolute close movement over the same window.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 15, min: 1, max: 500, step: 1,
    }],
    outputs: [{ id: 'line', name: 'VHF', defaultStyle: lineStyle('#42a5f5') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new VerticalHorizontalFilterProcessor(
        length(parameters?.length, 15),
    ),
});

export const VortexIndicator: IndicatorDefinition<
    IndicatorCandle,
    RangeLengthParameters
> = registerIndicator({
    id: 'VortexIndicator',
    name: 'Vortex Indicator',
    description: 'Positive and negative vortex movement divided by trailing true range.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 14, min: 1, max: 500, step: 1,
    }],
    outputs: [
        { id: 'viPlus', name: '+VI', defaultStyle: lineStyle('#26a69a') },
        { id: 'viMinus', name: '-VI', defaultStyle: lineStyle('#ef5350') },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new VortexIndicatorProcessor(
        length(parameters?.length, 14),
    ),
});

export const RangeIndicators = Object.freeze([
    AroonIndicator,
    AroonOscillatorIndicator,
    BalanceOfPowerIndicator,
    BearPowerIndicator,
    BullPowerIndicator,
    BalanceOfMarketPowerIndicator,
    ChoppinessIndexIndicator,
    ChandeKrollStopIndicator,
    ElderRayIndicator,
    FibonacciRetracementIndicator,
    VerticalHorizontalFilterIndicator,
    VortexIndicator,
] as const);
