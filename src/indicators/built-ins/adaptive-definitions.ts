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
    ExpandingAverageTrueRange,
    RingBuffer,
    RollingEfficiencyRatio,
    RollingMaximum,
    RollingMinimum,
    RollingSum,
    RollingStandardDeviation,
    type RingBufferCheckpoint,
    type ExpandingAverageTrueRangeCheckpoint,
    type RollingEfficiencyRatioCheckpoint,
    type RollingWindowCheckpoint,
    type SeededMovingAverageCheckpoint,
} from '../math/index.js';

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parameter(
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

export interface ParabolicSarParameters extends IndicatorParameters {
    readonly acceleration: number;
    readonly accelerationStep: number;
    readonly accelerationMax: number;
}

export interface KaufmanAdaptiveParameters extends IndicatorParameters {
    readonly length: number;
    readonly fastSc: number;
    readonly slowSc: number;
}

export interface AdaptiveLengthParameters extends IndicatorParameters {
    readonly length: number;
}

export interface VariableMovingAverageParameters extends IndicatorParameters {
    readonly length: number;
    readonly volatilityIndex: number;
}

export interface AdaptiveLaguerreFilterParameters extends IndicatorParameters {
    readonly gamma: number;
}

export interface LaguerreRsiParameters extends IndicatorParameters {
    readonly gamma: number;
}

export interface NickRypockTrailingReverseParameters extends IndicatorParameters {
    readonly length: number;
    readonly multiple: number;
}

export interface AdaptivePriceZoneParameters extends IndicatorParameters {
    readonly period: number;
    readonly bandPercentage: number;
}

export interface ParabolicSarCandleState {
    readonly high: number;
    readonly low: number;
}

export interface ParabolicSarCheckpoint {
    readonly validCandles: number;
    readonly tail: readonly ParabolicSarCandleState[];
    readonly longPosition: boolean;
    readonly extremePoint: number;
    readonly accelerationFactor: number;
    readonly previousBar: number;
    readonly accelerationIncreased: boolean;
    readonly reverseBar: number;
    readonly reverseValue: number;
    readonly previousSar: number;
    readonly todaySar: number;
    readonly lastReturned: number;
}

export interface KaufmanAdaptiveCheckpoint {
    readonly disabled: boolean;
    readonly seeded: boolean;
    readonly previous: number;
    readonly ratio: RollingEfficiencyRatioCheckpoint;
}

export interface FractalAdaptiveCheckpoint {
    readonly previous: number;
    readonly closes: RingBufferCheckpoint<number>;
}

export interface AdaptiveLaguerreFilterCheckpoint {
    readonly l0: number;
    readonly l1: number;
    readonly l2: number;
    readonly l3: number;
    readonly formed: boolean;
}

export interface LaguerreRsiCheckpoint {
    readonly l0: number;
    readonly l1: number;
    readonly l2: number;
    readonly l3: number;
    readonly previousUp: number;
    readonly previousDown: number;
    readonly formed: boolean;
}

export interface AdaptivePriceZoneCheckpoint {
    readonly average: SeededMovingAverageCheckpoint;
    readonly deviation: RollingWindowCheckpoint;
}

export interface VidyaCheckpoint {
    readonly initialized: boolean;
    readonly previousClose: number | null;
    readonly up: RollingWindowCheckpoint;
    readonly down: RollingWindowCheckpoint;
    readonly seed: RingBufferCheckpoint<number>;
    readonly previous: number;
}

export interface VariableMovingAverageCheckpoint {
    readonly initialized: boolean;
    readonly deviation: RollingWindowCheckpoint;
    readonly prices: RingBufferCheckpoint<number>;
    readonly previous: number;
}

export interface McGinleyDynamicCheckpoint {
    readonly count: number;
    readonly seedSum: number;
    readonly seedValid: boolean;
    readonly previous: number | null;
}

export interface NickRypockTrailingReverseCheckpoint {
    readonly initialized: boolean;
    readonly k: number;
    readonly reverse: number;
    readonly highPrice: number;
    readonly lowPrice: number;
    readonly trend: -1 | 0 | 1;
    readonly validCount: number;
}

export interface OptimalTrackingCheckpoint {
    readonly validCount: number;
    readonly previousAverage: number;
    readonly previousDifference: number;
    readonly previousHalfRange: number;
    readonly previousResult: number;
    readonly lambda: number;
}

export interface SuperTrendParameters extends IndicatorParameters {
    readonly length: number;
    readonly multiplier: number;
}

export interface SuperTrendCheckpoint {
    readonly averageTrueRange: ExpandingAverageTrueRangeCheckpoint;
    readonly previousSupertrend: number | null;
    readonly previousClose: number | null;
    readonly previousUpperBand: number | null;
    readonly previousLowerBand: number | null;
    readonly trend: -1 | 1;
}

interface FractalRange {
    readonly minimum: number;
    readonly maximum: number;
}

interface MutableParabolicSarState {
    validCandles: number;
    tail: ParabolicSarCandleState[];
    longPosition: boolean;
    extremePoint: number;
    accelerationFactor: number;
    previousBar: number;
    accelerationIncreased: boolean;
    reverseBar: number;
    reverseValue: number;
    previousSar: number;
    todaySar: number;
    lastReturned: number;
}

function initialState(): MutableParabolicSarState {
    return {
        validCandles: 0,
        tail: [],
        longPosition: false,
        extremePoint: 0,
        accelerationFactor: 0,
        previousBar: 0,
        accelerationIncreased: false,
        reverseBar: 0,
        reverseValue: 0,
        previousSar: 0,
        todaySar: 0,
        lastReturned: 0,
    };
}

export class ParabolicSarProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ParabolicSarCheckpoint
> {
    private state = initialState();

    constructor(
        readonly acceleration: number,
        readonly accelerationStep: number,
        readonly accelerationMax: number,
    ) {
        super(['value']);
        parameter(acceleration, acceleration, 0.001, 0.5, 'acceleration');
        parameter(accelerationStep, accelerationStep, 0.001, 0.5, 'accelerationStep');
        parameter(accelerationMax, accelerationMax, 0.01, 1, 'accelerationMax');
        if (acceleration > accelerationMax || accelerationStep > accelerationMax) {
            throw new RangeError(
                'sschart: indicator acceleration and step cannot exceed accelerationMax',
            );
        }
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        if (high === null || low === null) {
            return {
                isFormed: false,
                values: [this.output('value', null, input.index)],
            };
        }
        const result = this.evaluate({ high, low });
        if (commit) this.state = result.state;
        return {
            isFormed: result.value !== null,
            values: [this.output('value', result.value, input.index)],
        };
    }

    protected resetState(): void { this.state = initialState(); }

    protected captureState(): ParabolicSarCheckpoint {
        return Object.freeze({
            ...this.state,
            tail: Object.freeze(this.state.tail.map((candle) => Object.freeze({ ...candle }))),
        });
    }

    protected restoreState(state: ParabolicSarCheckpoint): void {
        const numeric = [
            state?.extremePoint,
            state?.accelerationFactor,
            state?.reverseValue,
            state?.previousSar,
            state?.todaySar,
            state?.lastReturned,
        ];
        if (state === null || typeof state !== 'object'
            || !Number.isInteger(state.validCandles) || state.validCandles < 0
            || !Array.isArray(state.tail) || state.tail.length > 3
            || state.tail.length !== Math.min(3, state.validCandles)
            || state.tail.some((candle) => candle === null || typeof candle !== 'object'
                || finite(candle.high) === null || finite(candle.low) === null)
            || typeof state.longPosition !== 'boolean'
            || typeof state.accelerationIncreased !== 'boolean'
            || !Number.isInteger(state.previousBar) || state.previousBar < 0
            || !Number.isInteger(state.reverseBar) || state.reverseBar < 0
            || numeric.some((value) => finite(value) === null)) {
            throw new TypeError('sschart: invalid Parabolic SAR checkpoint');
        }
        this.state = {
            ...state,
            tail: state.tail.map((candle) => ({ ...candle })),
        };
    }

    private evaluate(candle: ParabolicSarCandleState): {
        readonly state: MutableParabolicSarState;
        readonly value: number | null;
    } {
        const state: MutableParabolicSarState = {
            ...this.state,
            tail: this.state.tail.map((item) => ({ ...item })),
        };
        const append = (value: ParabolicSarCandleState) => {
            state.validCandles += 1;
            state.tail.push({ ...value });
            if (state.tail.length > 3) state.tail.shift();
        };
        if (state.validCandles === 0) append(candle);
        append(candle);

        const current = () => state.tail[state.tail.length - 1];
        const previous = () => state.tail[state.tail.length - 2];
        const reverse = (): number => {
            let result = state.extremePoint;
            const latest = current();
            const shouldFlip = (state.longPosition && state.previousSar > latest.low)
                || (!state.longPosition && state.previousSar < latest.high)
                || state.previousBar !== state.validCandles;
            if (shouldFlip) {
                state.longPosition = !state.longPosition;
                state.reverseBar = state.validCandles;
                state.reverseValue = state.extremePoint;
                state.accelerationFactor = this.acceleration;
                state.extremePoint = state.longPosition ? latest.high : latest.low;
                state.previousSar = result;
            } else result = state.previousSar;
            return result;
        };
        const today = (candidate: number): number => {
            const latest = current();
            const prior = previous();
            if (state.longPosition) {
                const lowest = Math.min(candidate, latest.low, prior.low);
                return latest.low > lowest ? lowest : reverse();
            }
            const highest = Math.max(candidate, latest.high, prior.high);
            return latest.high < highest ? highest : reverse();
        };
        const increaseAcceleration = () => {
            if (state.accelerationIncreased) return;
            state.accelerationFactor = Math.min(
                this.accelerationMax,
                state.accelerationFactor + this.accelerationStep,
            );
            state.accelerationIncreased = true;
        };

        if (state.validCandles < 3) return { state, value: null };
        if (state.validCandles === 3) {
            const latest = current();
            const prior = previous();
            state.longPosition = latest.high > prior.high;
            let maximum = -Infinity;
            let minimum = Infinity;
            for (const item of state.tail) {
                maximum = Math.max(maximum, item.high);
                minimum = Math.min(minimum, item.low);
            }
            state.extremePoint = state.longPosition ? maximum : minimum;
            state.accelerationFactor = this.acceleration;
            const value = state.extremePoint
                + (state.longPosition ? -1 : 1)
                    * (maximum - minimum) * state.accelerationFactor;
            state.lastReturned = value;
            return { state, value };
        }

        if (state.accelerationIncreased && state.previousBar !== state.validCandles)
            state.accelerationIncreased = false;
        let value = state.lastReturned;
        if (state.reverseBar !== state.validCandles) {
            state.todaySar = today(
                state.lastReturned + state.accelerationFactor
                    * (state.extremePoint - state.lastReturned),
            );
            for (let offset = 1; offset <= 2; offset += 1) {
                const prior = state.tail[state.tail.length - 1 - offset];
                if (state.longPosition) {
                    if (state.todaySar > prior.low) state.todaySar = prior.low;
                } else if (state.todaySar < prior.high) state.todaySar = prior.high;
            }
            const latest = current();
            const prior = previous();
            const crossed = (state.longPosition
                && (latest.low < state.todaySar || prior.low < state.todaySar))
                || (!state.longPosition
                    && (latest.high > state.todaySar || prior.high > state.todaySar));
            if (crossed) {
                value = reverse();
                state.lastReturned = value;
                state.previousBar = state.validCandles;
                return { state, value };
            }

            if (state.longPosition) {
                if (state.previousBar !== state.validCandles || latest.low < state.previousSar) {
                    value = state.todaySar;
                    state.previousSar = state.todaySar;
                } else value = state.previousSar;
                if (latest.high > state.extremePoint) {
                    state.extremePoint = latest.high;
                    increaseAcceleration();
                }
            } else {
                if (state.previousBar !== state.validCandles || latest.high > state.previousSar) {
                    value = state.todaySar;
                    state.previousSar = state.todaySar;
                } else value = state.previousSar;
                if (latest.low < state.extremePoint) {
                    state.extremePoint = latest.low;
                    increaseAcceleration();
                }
            }
        } else {
            const latest = current();
            if (state.longPosition && latest.high > state.extremePoint)
                state.extremePoint = latest.high;
            else if (!state.longPosition && latest.low < state.extremePoint)
                state.extremePoint = latest.low;
            value = state.previousSar;
            state.todaySar = today(state.longPosition
                ? Math.min(state.reverseValue, latest.low)
                : Math.max(state.reverseValue, latest.high));
        }
        state.previousBar = state.validCandles;
        state.lastReturned = value;
        return { state, value };
    }
}

function integer(
    value: unknown,
    fallback: number,
    minimum: number,
    maximum: number,
    name: string,
): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || (resolved as number) < minimum
        || (resolved as number) > maximum) {
        throw new RangeError(
            `sschart: indicator ${name} must be an integer from ${minimum} to ${maximum}`,
        );
    }
    return resolved as number;
}

export class McGinleyDynamicProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    McGinleyDynamicCheckpoint
> {
    private count = 0;
    private seedSum = 0;
    private seedValid = true;
    private previous: number | null = null;

    constructor(readonly length: number) {
        super(['line']);
        integer(length, length, 1, 500, 'length');
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const price = finite(input.value?.close);
        let value: number | null = null;

        if (this.count < this.length) {
            const count = this.count + 1;
            const seedSum = this.seedSum + (price ?? 0);
            const seedValid = this.seedValid && price !== null;
            if (count === this.length && seedValid) value = seedSum / this.length;
            if (commit) {
                this.count = count;
                this.seedSum = seedSum;
                this.seedValid = seedValid;
                if (value !== null) this.previous = value;
            }
        } else if (price !== null && this.previous !== null && this.previous !== 0) {
            const ratio = price / this.previous;
            const denominator = 0.6 * this.length * Math.pow(ratio, 4);
            if (Number.isFinite(denominator) && denominator !== 0) {
                value = finite(this.previous + (price - this.previous) / denominator);
                if (commit && value !== null) this.previous = value;
            }
        }

        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.count = 0;
        this.seedSum = 0;
        this.seedValid = true;
        this.previous = null;
    }

    protected captureState(): McGinleyDynamicCheckpoint {
        return Object.freeze({
            count: this.count,
            seedSum: this.seedSum,
            seedValid: this.seedValid,
            previous: this.previous,
        });
    }

    protected restoreState(state: McGinleyDynamicCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Number.isInteger(state.count) || state.count < 0 || state.count > this.length
            || finite(state.seedSum) === null || typeof state.seedValid !== 'boolean'
            || (state.previous !== null && finite(state.previous) === null)
            || (state.count < this.length && state.previous !== null)
            || (state.count === this.length && state.seedValid !== (state.previous !== null))) {
            throw new TypeError('sschart: invalid McGinley Dynamic checkpoint');
        }
        this.count = state.count;
        this.seedSum = state.seedSum;
        this.seedValid = state.seedValid;
        this.previous = state.previous;
    }
}

export class NickRypockTrailingReverseProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    NickRypockTrailingReverseCheckpoint
> {
    private initialized = false;
    private k = 0;
    private reverse = 0;
    private highPrice = 0;
    private lowPrice = 0;
    private trend: -1 | 0 | 1 = 0;
    private validCount = 0;
    private readonly multiplier: number;

    constructor(readonly length: number, readonly multiple: number) {
        super(['line']);
        integer(length, length, 1, 500, 'length');
        if (typeof multiple !== 'number' || !Number.isFinite(multiple))
            throw new RangeError('sschart: indicator multiple must be finite');
        this.multiplier = Math.max(1, multiple) / 1_000;
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const price = finite(input.value?.close);
        if (price === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        let initialized = this.initialized;
        let k = this.k;
        let reverse = this.reverse;
        let highPrice = this.highPrice;
        let lowPrice = this.lowPrice;
        let trend = this.trend;
        let newTrend: -1 | 0 | 1 = 0;
        if (!initialized) {
            initialized = true;
            k = price;
            highPrice = price;
            lowPrice = price;
        }

        k = (k + (price - k) / this.length) * this.multiplier;
        if (trend >= 0) {
            if (price > highPrice) highPrice = price;
            reverse = highPrice - k;
            if (price <= reverse) {
                newTrend = -1;
                lowPrice = price;
                reverse = lowPrice + k;
            } else {
                newTrend = 1;
            }
        }
        if (trend <= 0) {
            if (price < lowPrice) lowPrice = price;
            reverse = lowPrice + k;
            if (price >= reverse) {
                newTrend = 1;
                highPrice = price;
                reverse = highPrice - k;
            } else {
                newTrend = -1;
            }
        }
        if (newTrend !== 0) trend = newTrend;

        const validCount = this.validCount + 1;
        const value = validCount >= this.length ? finite(reverse) : null;
        if (commit) {
            this.initialized = initialized;
            this.k = k;
            this.reverse = reverse;
            this.highPrice = highPrice;
            this.lowPrice = lowPrice;
            this.trend = trend;
            this.validCount = validCount;
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.initialized = false;
        this.k = 0;
        this.reverse = 0;
        this.highPrice = 0;
        this.lowPrice = 0;
        this.trend = 0;
        this.validCount = 0;
    }

    protected captureState(): NickRypockTrailingReverseCheckpoint {
        return Object.freeze({
            initialized: this.initialized,
            k: this.k,
            reverse: this.reverse,
            highPrice: this.highPrice,
            lowPrice: this.lowPrice,
            trend: this.trend,
            validCount: this.validCount,
        });
    }

    protected restoreState(state: NickRypockTrailingReverseCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || typeof state.initialized !== 'boolean'
            || finite(state.k) === null || finite(state.reverse) === null
            || finite(state.highPrice) === null || finite(state.lowPrice) === null
            || ![-1, 0, 1].includes(state.trend)
            || !Number.isInteger(state.validCount) || state.validCount < 0
            || state.initialized !== (state.validCount > 0)
            || (!state.initialized && (
                state.k !== 0 || state.reverse !== 0 || state.highPrice !== 0
                || state.lowPrice !== 0 || state.trend !== 0
            ))) {
            throw new TypeError('sschart: invalid Nick Rypock Trailing Reverse checkpoint');
        }
        this.initialized = state.initialized;
        this.k = state.k;
        this.reverse = state.reverse;
        this.highPrice = state.highPrice;
        this.lowPrice = state.lowPrice;
        this.trend = state.trend;
        this.validCount = state.validCount;
    }
}

const OPTIMAL_TRACKING_DECAY = Math.exp(-0.25);
const OPTIMAL_TRACKING_WEIGHT = 1 - OPTIMAL_TRACKING_DECAY;

export class OptimalTrackingProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    OptimalTrackingCheckpoint
> {
    private validCount = 0;
    private previousAverage = 0;
    private previousDifference = 0;
    private previousHalfRange = 0;
    private previousResult = 0;
    private lambda = 0;

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        if (high === null || low === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const average = (high + low) / 2;
        const halfRange = (high - low) / 2;
        if (this.validCount === 0) {
            if (commit) {
                this.validCount = 1;
                this.previousAverage = average;
                this.previousHalfRange = halfRange;
                this.previousResult = average;
            }
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const difference = OPTIMAL_TRACKING_WEIGHT * (average - this.previousAverage)
            + OPTIMAL_TRACKING_DECAY * this.previousDifference;
        const range = OPTIMAL_TRACKING_WEIGHT * halfRange
            + OPTIMAL_TRACKING_DECAY * this.previousHalfRange;
        const lambda = range === 0 ? this.lambda : Math.abs(difference / range);
        const lambdaSquared = lambda * lambda;
        const alpha = (-lambdaSquared
            + Math.sqrt(lambdaSquared * lambdaSquared + 16 * lambdaSquared)) / 8;
        const value = alpha * average + (1 - alpha) * this.previousResult;

        if (commit) {
            this.validCount = 2;
            this.previousAverage = average;
            this.previousDifference = difference;
            this.previousHalfRange = range;
            this.previousResult = value;
            this.lambda = lambda;
        }
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.validCount = 0;
        this.previousAverage = 0;
        this.previousDifference = 0;
        this.previousHalfRange = 0;
        this.previousResult = 0;
        this.lambda = 0;
    }

    protected captureState(): OptimalTrackingCheckpoint {
        return Object.freeze({
            validCount: this.validCount,
            previousAverage: this.previousAverage,
            previousDifference: this.previousDifference,
            previousHalfRange: this.previousHalfRange,
            previousResult: this.previousResult,
            lambda: this.lambda,
        });
    }

    protected restoreState(state: OptimalTrackingCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Number.isInteger(state.validCount)
            || state.validCount < 0 || state.validCount > 2
            || finite(state.previousAverage) === null
            || finite(state.previousDifference) === null
            || finite(state.previousHalfRange) === null
            || finite(state.previousResult) === null
            || finite(state.lambda) === null || state.lambda < 0) {
            throw new TypeError('sschart: invalid Optimal Tracking checkpoint');
        }
        this.validCount = state.validCount;
        this.previousAverage = state.previousAverage;
        this.previousDifference = state.previousDifference;
        this.previousHalfRange = state.previousHalfRange;
        this.previousResult = state.previousResult;
        this.lambda = state.lambda;
    }
}

/** StockSharp SuperTrend with direction carried as painter metadata. */
export class SuperTrendProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    SuperTrendCheckpoint
> {
    private readonly averageTrueRange: ExpandingAverageTrueRange;
    private previousSupertrend: number | null = null;
    private previousClose: number | null = null;
    private previousUpperBand: number | null = null;
    private previousLowerBand: number | null = null;
    private trend: -1 | 1 = 1;

    constructor(readonly length: number, readonly multiplier: number) {
        super(['value']);
        integer(length, length, 1, 500, 'length');
        parameter(multiplier, multiplier, 0.000001, 500, 'multiplier');
        this.averageTrueRange = new ExpandingAverageTrueRange(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const candle = input.value;
        const averageTrueRange = commit
            ? this.averageTrueRange.push(candle)
            : this.averageTrueRange.preview(candle);
        const high = finite(candle?.high);
        const low = finite(candle?.low);
        const close = finite(candle?.close);

        // AverageTrueRange emits a growing warm-up value, while StockSharp's
        // SuperTrend deliberately waits until its configured window is formed.
        if (input.index < this.length - 1 || averageTrueRange === null
            || high === null || low === null || close === null) {
            return {
                isFormed: false,
                values: [this.output('value', null, input.index)],
            };
        }

        const midpoint = (high + low) / 2;
        const basicUpperBand = midpoint + this.multiplier * averageTrueRange;
        const basicLowerBand = midpoint - this.multiplier * averageTrueRange;
        const finalUpperBand = this.previousUpperBand === null
            || basicUpperBand < this.previousUpperBand
            || (this.previousClose !== null && this.previousClose > this.previousUpperBand)
            ? basicUpperBand
            : this.previousUpperBand;
        const finalLowerBand = this.previousLowerBand === null
            || basicLowerBand > this.previousLowerBand
            || (this.previousClose !== null && this.previousClose < this.previousLowerBand)
            ? basicLowerBand
            : this.previousLowerBand;

        let value: number;
        let trend: -1 | 1;
        if (this.previousSupertrend === null) {
            trend = close >= midpoint ? 1 : -1;
            value = trend === 1 ? finalLowerBand : finalUpperBand;
        } else if (this.trend === 1) {
            trend = close <= finalLowerBand ? -1 : 1;
            value = trend === 1 ? finalLowerBand : finalUpperBand;
        } else {
            trend = close >= finalUpperBand ? 1 : -1;
            value = trend === 1 ? finalLowerBand : finalUpperBand;
        }

        if (commit) {
            this.previousSupertrend = value;
            this.previousClose = close;
            this.previousUpperBand = finalUpperBand;
            this.previousLowerBand = finalLowerBand;
            this.trend = trend;
        }
        return {
            isFormed: true,
            values: [this.output('value', value, input.index, { up: trend === 1 })],
        };
    }

    protected resetState(): void {
        this.averageTrueRange.reset();
        this.previousSupertrend = null;
        this.previousClose = null;
        this.previousUpperBand = null;
        this.previousLowerBand = null;
        this.trend = 1;
    }

    protected captureState(): SuperTrendCheckpoint {
        return Object.freeze({
            averageTrueRange: this.averageTrueRange.checkpoint(),
            previousSupertrend: this.previousSupertrend,
            previousClose: this.previousClose,
            previousUpperBand: this.previousUpperBand,
            previousLowerBand: this.previousLowerBand,
            trend: this.trend,
        });
    }

    protected restoreState(state: SuperTrendCheckpoint): void {
        const recursive = [
            state?.previousSupertrend,
            state?.previousClose,
            state?.previousUpperBand,
            state?.previousLowerBand,
        ];
        const initialized = recursive[0] !== null;
        if (state === null || typeof state !== 'object'
            || ![-1, 1].includes(state.trend)
            || recursive.some((value) => value !== null && finite(value) === null)
            || recursive.some((value) => (value !== null) !== initialized)) {
            throw new TypeError('sschart: invalid SuperTrend checkpoint');
        }
        this.averageTrueRange.restore(state.averageTrueRange);
        this.previousSupertrend = state.previousSupertrend;
        this.previousClose = state.previousClose;
        this.previousUpperBand = state.previousUpperBand;
        this.previousLowerBand = state.previousLowerBand;
        this.trend = state.trend;
    }
}

export class KaufmanEfficiencyRatioProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingEfficiencyRatioCheckpoint
> {
    private readonly ratio: RollingEfficiencyRatio;

    constructor(readonly length: number) {
        super(['line']);
        integer(length, length, 1, 500, 'length');
        this.ratio = new RollingEfficiencyRatio(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const value = commit ? this.ratio.push(close) : this.ratio.preview(close);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.ratio.reset(); }
    protected captureState(): RollingEfficiencyRatioCheckpoint {
        return this.ratio.checkpoint();
    }
    protected restoreState(state: RollingEfficiencyRatioCheckpoint): void {
        this.ratio.restore(state);
    }
}

export class AdaptiveLaguerreFilterProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    AdaptiveLaguerreFilterCheckpoint
> {
    private l0 = 0;
    private l1 = 0;
    private l2 = 0;
    private l3 = 0;
    private formed = false;

    constructor(readonly gamma: number) {
        super(['line']);
        parameter(gamma, gamma, 0.000001, 0.999999, 'gamma');
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const price = finite(input.value?.close);
        if (price === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const complement = 1 - this.gamma;
        const l0 = complement * price + this.gamma * this.l0;
        const l1 = complement * l0 + this.gamma * this.l1;
        const l2 = complement * l1 + this.gamma * this.l2;
        const l3 = complement * l2 + this.gamma * this.l3;
        const value = (l0 + 2 * l1 + 2 * l2 + l3) / 6;
        const formed = this.formed || value >= price;

        if (commit) {
            this.l0 = l0;
            this.l1 = l1;
            this.l2 = l2;
            this.l3 = l3;
            this.formed = formed;
        }
        return {
            isFormed: formed,
            values: [this.output('line', formed ? value : null, input.index)],
        };
    }

    protected resetState(): void {
        this.l0 = 0;
        this.l1 = 0;
        this.l2 = 0;
        this.l3 = 0;
        this.formed = false;
    }

    protected captureState(): AdaptiveLaguerreFilterCheckpoint {
        return Object.freeze({
            l0: this.l0,
            l1: this.l1,
            l2: this.l2,
            l3: this.l3,
            formed: this.formed,
        });
    }

    protected restoreState(state: AdaptiveLaguerreFilterCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.l0) === null || finite(state.l1) === null
            || finite(state.l2) === null || finite(state.l3) === null
            || typeof state.formed !== 'boolean') {
            throw new TypeError('sschart: invalid Adaptive Laguerre Filter checkpoint');
        }
        this.l0 = state.l0;
        this.l1 = state.l1;
        this.l2 = state.l2;
        this.l3 = state.l3;
        this.formed = state.formed;
    }
}

export class LaguerreRsiProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    LaguerreRsiCheckpoint
> {
    private l0 = 0;
    private l1 = 0;
    private l2 = 0;
    private l3 = 0;
    private previousUp = 0;
    private previousDown = 0;
    private formed = false;

    constructor(readonly gamma: number) {
        super(['line']);
        parameter(gamma, gamma, 0.000001, 0.999999, 'gamma');
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const price = finite(input.value?.close);
        if (price === null) {
            return {
                isFormed: this.formed,
                values: [this.output('line', null, input.index)],
            };
        }

        const complement = 1 - this.gamma;
        const l0 = complement * price + this.gamma * this.l0;
        const l1 = -this.gamma * l0 + this.l0 + this.gamma * this.l1;
        const l2 = -this.gamma * l1 + this.l1 + this.gamma * this.l2;
        const l3 = -this.gamma * l2 + this.l2 + this.gamma * this.l3;

        let up = 0;
        let down = 0;
        if (l0 >= l1) up += l0 - l1;
        else down += l1 - l0;
        if (l1 >= l2) up += l1 - l2;
        else down += l2 - l1;
        if (l2 >= l3) up += l2 - l3;
        else down += l3 - l2;

        const smoothedUp = complement * up + this.gamma * this.previousUp;
        const smoothedDown = complement * down + this.gamma * this.previousDown;
        const total = smoothedUp + smoothedDown;
        const value = total === 0 ? 50 : smoothedUp / total * 100;
        const formed = this.formed || commit;

        if (commit) {
            this.l0 = l0;
            this.l1 = l1;
            this.l2 = l2;
            this.l3 = l3;
            this.previousUp = smoothedUp;
            this.previousDown = smoothedDown;
            this.formed = true;
        }
        return {
            isFormed: formed,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.l0 = 0;
        this.l1 = 0;
        this.l2 = 0;
        this.l3 = 0;
        this.previousUp = 0;
        this.previousDown = 0;
        this.formed = false;
    }

    protected captureState(): LaguerreRsiCheckpoint {
        return Object.freeze({
            l0: this.l0,
            l1: this.l1,
            l2: this.l2,
            l3: this.l3,
            previousUp: this.previousUp,
            previousDown: this.previousDown,
            formed: this.formed,
        });
    }

    protected restoreState(state: LaguerreRsiCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.l0) === null || finite(state.l1) === null
            || finite(state.l2) === null || finite(state.l3) === null
            || finite(state.previousUp) === null || state.previousUp < 0
            || finite(state.previousDown) === null || state.previousDown < 0
            || typeof state.formed !== 'boolean') {
            throw new TypeError('sschart: invalid Laguerre RSI checkpoint');
        }
        this.l0 = state.l0;
        this.l1 = state.l1;
        this.l2 = state.l2;
        this.l3 = state.l3;
        this.previousUp = state.previousUp;
        this.previousDown = state.previousDown;
        this.formed = state.formed;
    }
}

export class AdaptivePriceZoneProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    AdaptivePriceZoneCheckpoint
> {
    private readonly average: ExponentialMovingAverage;
    private readonly deviation: RollingStandardDeviation;

    constructor(readonly period: number, readonly bandPercentage: number) {
        super(['ma', 'upper', 'lower']);
        integer(period, period, 1, 500, 'period');
        parameter(bandPercentage, bandPercentage, 0, 500, 'bandPercentage');
        this.average = new ExponentialMovingAverage(period);
        this.deviation = new RollingStandardDeviation(period);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const ma = commit ? this.average.push(close) : this.average.preview(close);
        const deviation = commit ? this.deviation.push(close) : this.deviation.preview(close);
        const formed = ma !== null && deviation !== null;
        return {
            isFormed: formed,
            values: [
                this.output('ma', formed ? ma : null, input.index),
                this.output(
                    'upper',
                    formed ? ma + this.bandPercentage * deviation : null,
                    input.index,
                ),
                this.output(
                    'lower',
                    formed ? ma - this.bandPercentage * deviation : null,
                    input.index,
                ),
            ],
        };
    }

    protected resetState(): void {
        this.average.reset();
        this.deviation.reset();
    }

    protected captureState(): AdaptivePriceZoneCheckpoint {
        return Object.freeze({
            average: this.average.checkpoint(),
            deviation: this.deviation.checkpoint(),
        });
    }

    protected restoreState(state: AdaptivePriceZoneCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid Adaptive Price Zone checkpoint');
        this.average.restore(state.average);
        this.deviation.restore(state.deviation);
    }
}

export class VidyaProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    VidyaCheckpoint
> {
    private initialized = false;
    private previousClose: number | null = null;
    private readonly up: RollingSum;
    private readonly down: RollingSum;
    private readonly seed: RingBuffer<number>;
    private seedSum = 0;
    private previous = 0;
    private readonly multiplier: number;

    constructor(readonly length: number) {
        super(['line']);
        integer(length, length, 1, 500, 'length');
        this.up = new RollingSum(length);
        this.down = new RollingSum(length);
        this.seed = new RingBuffer(length);
        this.multiplier = 2 / (length + 1);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        if (close === null) {
            return {
                isFormed: this.seed.full,
                values: [this.output('line', null, input.index)],
            };
        }
        if (!this.initialized) {
            if (commit) {
                this.initialized = true;
                this.previousClose = close;
            }
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const delta = close - this.previousClose!;
        const up = Math.max(delta, 0);
        const down = Math.max(-delta, 0);
        const upSum = commit ? this.up.push(up) : this.up.preview(up);
        const downSum = commit ? this.down.push(down) : this.down.preview(down);
        if (commit) this.previousClose = close;
        if (upSum === null || downSum === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const total = upSum + downSum;
        const cmo = total === 0 ? 0 : 100 * (upSum - downSum) / total;
        if (!this.seed.full) {
            const value = (this.seedSum + close) / this.length;
            const formed = this.seed.size + 1 >= this.length;
            if (commit) {
                this.seed.push(close);
                this.seedSum += close;
                this.previous = value;
            }
            return {
                isFormed: formed,
                values: [this.output('line', formed ? value : null, input.index)],
            };
        }

        const value = (close - this.previous)
            * this.multiplier * Math.abs(cmo / 100) + this.previous;
        if (commit) this.previous = value;
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.initialized = false;
        this.previousClose = null;
        this.up.reset();
        this.down.reset();
        this.seed.clear();
        this.seedSum = 0;
        this.previous = 0;
    }

    protected captureState(): VidyaCheckpoint {
        return Object.freeze({
            initialized: this.initialized,
            previousClose: this.previousClose,
            up: this.up.checkpoint(),
            down: this.down.checkpoint(),
            seed: this.seed.checkpoint(),
            previous: this.previous,
        });
    }

    protected restoreState(state: VidyaCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || typeof state.initialized !== 'boolean'
            || (state.previousClose !== null && finite(state.previousClose) === null)
            || finite(state.previous) === null
            || !Array.isArray(state.up?.values) || !Array.isArray(state.down?.values)
            || !Array.isArray(state.seed?.values)
            || state.up.values.length !== state.down.values.length
            || state.up.values.length > this.length
            || state.seed.values.length > this.length
            || state.up.values.some((value) => finite(value) === null || value < 0)
            || state.down.values.some((value) => finite(value) === null || value < 0)
            || state.seed.values.some((value) => finite(value) === null)
            || (!state.initialized && (
                state.previousClose !== null
                || state.up.values.length !== 0
                || state.seed.values.length !== 0
                || state.previous !== 0
            ))
            || (state.initialized && state.previousClose === null)
            || (state.seed.values.length > 0 && state.up.values.length < this.length)
            || (state.seed.values.length === 0 && state.previous !== 0)) {
            throw new TypeError('sschart: invalid VIDYA checkpoint');
        }
        this.up.restore(state.up);
        this.down.restore(state.down);
        this.seed.restore(state.seed);
        this.initialized = state.initialized;
        this.previousClose = state.previousClose;
        this.seedSum = state.seed.values.reduce((sum, value) => sum + value, 0);
        this.previous = state.previous;
    }
}

export class VariableMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    VariableMovingAverageCheckpoint
> {
    private initialized = false;
    private readonly deviation: RollingStandardDeviation;
    private readonly prices: RingBuffer<number>;
    private priceSum = 0;
    private previous = 0;

    constructor(
        readonly length: number,
        readonly volatilityIndex: number,
    ) {
        super(['line']);
        integer(length, length, 1, 500, 'length');
        parameter(volatilityIndex, volatilityIndex, 0.001, 1, 'volatilityIndex');
        this.deviation = new RollingStandardDeviation(length);
        this.prices = new RingBuffer(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        if (close === null) {
            return {
                isFormed: this.deviation.isFormed,
                values: [this.output('line', null, input.index)],
            };
        }
        if (!this.initialized) {
            if (commit) {
                this.initialized = true;
                this.prices.push(close);
                this.priceSum = close;
                this.previous = close;
            }
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const deviation = commit
            ? this.deviation.push(close)
            : this.deviation.preview(close);
        if (deviation === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const averagePrice = this.priceSum / this.prices.size;
        const variableIndex = averagePrice === 0
            ? 0
            : Math.abs(deviation / averagePrice);
        const smoothing = 2
            / (this.length * (1 + this.volatilityIndex * variableIndex) + 1);
        const value = (close - this.previous) * smoothing + this.previous;
        if (commit) {
            if (this.prices.full) this.priceSum -= this.prices.front()!;
            this.prices.push(close);
            this.priceSum += close;
            this.previous = value;
        }
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.initialized = false;
        this.deviation.reset();
        this.prices.clear();
        this.priceSum = 0;
        this.previous = 0;
    }

    protected captureState(): VariableMovingAverageCheckpoint {
        return Object.freeze({
            initialized: this.initialized,
            deviation: this.deviation.checkpoint(),
            prices: this.prices.checkpoint(),
            previous: this.previous,
        });
    }

    protected restoreState(state: VariableMovingAverageCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || typeof state.initialized !== 'boolean'
            || finite(state.previous) === null
            || !Array.isArray(state.deviation?.values)
            || !Array.isArray(state.prices?.values)
            || state.deviation.values.length > this.length
            || state.prices.values.length > this.length
            || state.deviation.values.some((value) => finite(value) === null)
            || state.prices.values.some((value) => finite(value) === null)
            || (!state.initialized && (
                state.deviation.values.length !== 0
                || state.prices.values.length !== 0
                || state.previous !== 0
            ))
            || (state.initialized && state.prices.values.length === 0)) {
            throw new TypeError('sschart: invalid Variable Moving Average checkpoint');
        }
        this.deviation.restore(state.deviation);
        this.prices.restore(state.prices);
        this.initialized = state.initialized;
        this.priceSum = state.prices.values.reduce((sum, value) => sum + value, 0);
        this.previous = state.previous;
    }
}

export class KaufmanAdaptiveMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    KaufmanAdaptiveCheckpoint
> {
    private readonly ratio: RollingEfficiencyRatio;
    private readonly fastConstant: number;
    private readonly slowConstant: number;
    private disabled = false;
    private seeded = false;
    private previous = 0;

    constructor(
        readonly length: number,
        readonly fastSc: number,
        readonly slowSc: number,
    ) {
        super(['line']);
        integer(length, length, 1, 500, 'length');
        integer(fastSc, fastSc, 1, 500, 'fastSc');
        integer(slowSc, slowSc, 1, 500, 'slowSc');
        this.ratio = new RollingEfficiencyRatio(length + 1);
        this.fastConstant = 2 / (fastSc + 1);
        this.slowConstant = 2 / (slowSc + 1);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        if (this.disabled) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }
        const close = finite(input.value?.close);
        const efficiency = commit ? this.ratio.push(close) : this.ratio.preview(close);
        if (input.index < this.length) {
            if (commit && close === null) this.disabled = true;
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }
        if (!this.seeded) {
            if (close === null || efficiency === null) {
                if (commit) this.disabled = true;
                return {
                    isFormed: false,
                    values: [this.output('line', null, input.index)],
                };
            }
            if (commit) {
                this.seeded = true;
                this.previous = close;
            }
            return {
                isFormed: true,
                values: [this.output('line', close, input.index)],
            };
        }
        if (close === null || efficiency === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }
        const scaled = efficiency * (this.fastConstant - this.slowConstant)
            + this.slowConstant;
        const value = (close - this.previous) * scaled * scaled + this.previous;
        if (commit) this.previous = value;
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.ratio.reset();
        this.disabled = false;
        this.seeded = false;
        this.previous = 0;
    }

    protected captureState(): KaufmanAdaptiveCheckpoint {
        return Object.freeze({
            disabled: this.disabled,
            seeded: this.seeded,
            previous: this.previous,
            ratio: this.ratio.checkpoint(),
        });
    }

    protected restoreState(state: KaufmanAdaptiveCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || typeof state.disabled !== 'boolean' || typeof state.seeded !== 'boolean'
            || finite(state.previous) === null || (state.disabled && state.seeded)) {
            throw new TypeError('sschart: invalid KAMA checkpoint');
        }
        this.ratio.restore(state.ratio);
        this.disabled = state.disabled;
        this.seeded = state.seeded;
        this.previous = state.previous;
    }
}

export class FractalAdaptiveMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    FractalAdaptiveCheckpoint
> {
    private readonly period: number;
    private readonly remaining: number;
    private readonly closes: RingBuffer<number>;
    private readonly periodMinimum: RollingMinimum | null;
    private readonly periodMaximum: RollingMaximum | null;
    private readonly remainingMinimum: RollingMinimum | null;
    private readonly remainingMaximum: RollingMaximum | null;
    private readonly periodRanges: RingBuffer<FractalRange | null> | null;
    private previous = 0;

    constructor(readonly length: number) {
        super(['line']);
        integer(length, length, 1, 500, 'length');
        this.period = Math.floor(length / 3);
        this.remaining = length - this.period * 2;
        this.closes = new RingBuffer(length);
        if (this.period === 0) {
            this.periodMinimum = null;
            this.periodMaximum = null;
            this.remainingMinimum = null;
            this.remainingMaximum = null;
            this.periodRanges = null;
            return;
        }
        this.periodMinimum = new RollingMinimum(this.period);
        this.periodMaximum = new RollingMaximum(this.period);
        this.remainingMinimum = new RollingMinimum(this.remaining);
        this.remainingMaximum = new RollingMaximum(this.remaining);
        this.periodRanges = new RingBuffer(this.period + this.remaining);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        if (close === null || this.period === 0) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        // Both older ranges end before the candidate close, so they can be
        // resolved from committed state for final input and previews alike.
        const first = this.delayedRange(this.period + this.remaining);
        const second = this.delayedRange(this.remaining);
        const remainingMinimum = commit
            ? this.remainingMinimum!.push(close)
            : this.remainingMinimum!.preview(close);
        const remainingMaximum = commit
            ? this.remainingMaximum!.push(close)
            : this.remainingMaximum!.preview(close);

        if (commit) {
            const periodMinimum = this.periodMinimum!.push(close);
            const periodMaximum = this.periodMaximum!.push(close);
            this.closes.push(close);
            this.periodRanges!.push(
                periodMinimum === null || periodMaximum === null
                    ? null
                    : Object.freeze({
                        minimum: periodMinimum,
                        maximum: periodMaximum,
                    }),
            );
        }

        if (first === null || second === null
            || remainingMinimum === null || remainingMaximum === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const firstDimension = (first.maximum - first.minimum) / this.period;
        const secondDimension = (second.maximum - second.minimum) / this.period;
        const thirdDimension = (remainingMaximum - remainingMinimum) / this.period;
        let dimension = (
            Math.log(firstDimension + secondDimension) - Math.log(thirdDimension)
        ) / Math.log(2);
        if (!Number.isFinite(dimension)) dimension = 1;
        else dimension = Math.max(1, Math.min(2, dimension));
        const alpha = Math.exp(-4.6 * (dimension - 1));
        const value = alpha * close + (1 - alpha) * this.previous;
        if (commit) this.previous = value;
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.previous = 0;
        this.closes.clear();
        this.periodMinimum?.reset();
        this.periodMaximum?.reset();
        this.remainingMinimum?.reset();
        this.remainingMaximum?.reset();
        this.periodRanges?.clear();
    }

    protected captureState(): FractalAdaptiveCheckpoint {
        return Object.freeze({
            previous: this.previous,
            closes: this.closes.checkpoint(),
        });
    }

    protected restoreState(state: FractalAdaptiveCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.previous) === null
            || state.closes === null || typeof state.closes !== 'object'
            || !Array.isArray(state.closes.values)
            || state.closes.values.length > this.length
            || state.closes.values.some((value) => finite(value) === null)) {
            throw new TypeError('sschart: invalid FRAMA checkpoint');
        }
        this.resetState();
        if (this.period > 0) {
            for (const close of state.closes.values) this.restoreClose(close);
        }
        this.previous = state.previous;
    }

    private delayedRange(offset: number): FractalRange | null {
        const ranges = this.periodRanges!;
        const index = ranges.size - offset;
        return index < 0 ? null : (ranges.at(index) ?? null);
    }

    private restoreClose(close: number): void {
        const periodMinimum = this.periodMinimum!.push(close);
        const periodMaximum = this.periodMaximum!.push(close);
        this.remainingMinimum!.push(close);
        this.remainingMaximum!.push(close);
        this.closes.push(close);
        this.periodRanges!.push(
            periodMinimum === null || periodMaximum === null
                ? null
                : Object.freeze({ minimum: periodMinimum, maximum: periodMaximum }),
        );
    }
}

export const ParabolicSarIndicator: IndicatorDefinition<
    IndicatorCandle,
    ParabolicSarParameters
> = registerIndicator({
    id: 'ParabolicSar',
    name: 'Parabolic SAR',
    description: 'Wilder trend-following stop-and-reverse points.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'acceleration', name: 'Acceleration', type: IndicatorParameterType.Number,
            defaultValue: 0.02, min: 0.001, max: 0.5, step: 0.001,
        },
        {
            id: 'accelerationStep', name: 'Acceleration Step',
            type: IndicatorParameterType.Number,
            defaultValue: 0.02, min: 0.001, max: 0.5, step: 0.001,
        },
        {
            id: 'accelerationMax', name: 'Acceleration Max',
            type: IndicatorParameterType.Number,
            defaultValue: 0.2, min: 0.01, max: 1, step: 0.01,
        },
    ],
    outputs: [{
        id: 'value',
        name: 'SAR',
        defaultStyle: {
            series: IndicatorSeriesStyle.Markers,
            color: '#ffca28',
            options: { pointMarkersRadius: 3 },
        },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new ParabolicSarProcessor(
        parameter(parameters?.acceleration, 0.02, 0.001, 0.5, 'acceleration'),
        parameter(parameters?.accelerationStep, 0.02, 0.001, 0.5, 'accelerationStep'),
        parameter(parameters?.accelerationMax, 0.2, 0.01, 1, 'accelerationMax'),
    ),
});

export const McGinleyDynamicIndicator: IndicatorDefinition<
    IndicatorCandle,
    AdaptiveLengthParameters
> = registerIndicator({
    id: 'McGinleyDynamic',
    name: 'McGinley Dynamic',
    description: 'Price-speed-adjusted recursive moving average seeded by a full-window mean.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 14, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line', name: 'McGinley Dynamic',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#42a5f5',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new McGinleyDynamicProcessor(
        integer(parameters?.length, 14, 1, 500, 'length'),
    ),
});

export const NickRypockTrailingReverseIndicator: IndicatorDefinition<
    IndicatorCandle,
    NickRypockTrailingReverseParameters
> = registerIndicator({
    id: 'NickRypockTrailingReverse',
    name: 'Nick Rypock Trailing Reverse',
    description: 'Adaptive trailing reversal line driven by trend extremes and a smoothed step.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 50, min: 1, max: 500, step: 1,
        },
        {
            id: 'multiple', name: 'Multiple (per mille)',
            type: IndicatorParameterType.Number,
            defaultValue: 100, min: 1, max: 1_000, step: 1,
        },
    ],
    outputs: [{
        id: 'line', name: 'NRTR',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#ef5350',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new NickRypockTrailingReverseProcessor(
        integer(parameters?.length, 50, 1, 500, 'length'),
        parameter(parameters?.multiple, 100, 1, 1_000, 'multiple'),
    ),
});

export const OptimalTrackingIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'OptimalTracking',
    name: 'Optimal Tracking',
    description: 'Adaptive filter that tracks the candle midprice using its smoothed range.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{
        id: 'line', name: 'Optimal Tracking',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#26a69a',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: () => new OptimalTrackingProcessor(),
});

export const SuperTrendIndicator: IndicatorDefinition<
    IndicatorCandle,
    SuperTrendParameters
> = registerIndicator({
    id: 'SuperTrend',
    name: 'Super Trend',
    description: 'ATR-based trailing trend line with the direction attached to each point.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 10, min: 1, max: 500, step: 1,
        },
        {
            id: 'multiplier', name: 'Multiplier', type: IndicatorParameterType.Number,
            defaultValue: 3, min: 0.000001, max: 500, step: 0.1,
        },
    ],
    outputs: [{
        id: 'value', name: 'Super Trend',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#26a69a',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new SuperTrendProcessor(
        integer(parameters?.length, 10, 1, 500, 'length'),
        parameter(parameters?.multiplier, 3, 0.000001, 500, 'multiplier'),
    ),
});

export const VidyaIndicator: IndicatorDefinition<
    IndicatorCandle,
    AdaptiveLengthParameters
> = registerIndicator({
    id: 'Vidya',
    name: 'VIDYA',
    description: 'Chande variable-index dynamic average driven by absolute momentum.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 15, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line', name: 'VIDYA',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#26a69a',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new VidyaProcessor(
        integer(parameters?.length, 15, 1, 500, 'length'),
    ),
});

export const VariableMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    VariableMovingAverageParameters
> = registerIndicator({
    id: 'VariableMovingAverage',
    name: 'Variable Moving Average',
    description: 'EMA-like average whose smoothing decreases as relative volatility rises.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 20, min: 1, max: 500, step: 1,
        },
        {
            id: 'volatilityIndex', name: 'Volatility Index',
            type: IndicatorParameterType.Number,
            defaultValue: 0.2, min: 0.001, max: 1, step: 0.001,
        },
    ],
    outputs: [{
        id: 'line', name: 'VMA',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#42a5f5',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new VariableMovingAverageProcessor(
        integer(parameters?.length, 20, 1, 500, 'length'),
        parameter(parameters?.volatilityIndex, 0.2, 0.001, 1, 'volatilityIndex'),
    ),
});

export const KaufmanAdaptiveMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    KaufmanAdaptiveParameters
> = registerIndicator({
    id: 'KaufmanAdaptiveMovingAverage',
    name: 'Kaufman Adaptive Moving Average',
    description: 'Efficiency-ratio adaptive moving average with fast and slow limits.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 10, min: 1, max: 500, step: 1,
        },
        {
            id: 'fastSc', name: 'Fast SC', type: IndicatorParameterType.Integer,
            defaultValue: 2, min: 1, max: 500, step: 1,
        },
        {
            id: 'slowSc', name: 'Slow SC', type: IndicatorParameterType.Integer,
            defaultValue: 30, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'line', name: 'KAMA',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#26c6da',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new KaufmanAdaptiveMovingAverageProcessor(
        integer(parameters?.length, 10, 1, 500, 'length'),
        integer(parameters?.fastSc, 2, 1, 500, 'fastSc'),
        integer(parameters?.slowSc, 30, 1, 500, 'slowSc'),
    ),
});

export const KaufmanEfficiencyRatioIndicator: IndicatorDefinition<
    IndicatorCandle,
    AdaptiveLengthParameters
> = registerIndicator({
    id: 'KaufmanEfficiencyRatio',
    name: 'Kaufman Efficiency Ratio',
    description: 'Directional price change divided by total path volatility.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 10, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line', name: 'KER',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#7e57c2',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new KaufmanEfficiencyRatioProcessor(
        integer(parameters?.length, 10, 1, 500, 'length'),
    ),
});

export const FractalAdaptiveMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    AdaptiveLengthParameters
> = registerIndicator({
    id: 'FractalAdaptiveMovingAverage',
    name: 'Fractal Adaptive Moving Average',
    description: 'Ehlers adaptive average driven by the rolling fractal dimension.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 20, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line', name: 'FRAMA',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#ab47bc',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new FractalAdaptiveMovingAverageProcessor(
        integer(parameters?.length, 20, 1, 500, 'length'),
    ),
});

export const AdaptiveLaguerreFilterIndicator: IndicatorDefinition<
    IndicatorCandle,
    AdaptiveLaguerreFilterParameters
> = registerIndicator({
    id: 'AdaptiveLaguerreFilter',
    name: 'Adaptive Laguerre Filter',
    description: 'Four-stage recursive Laguerre low-pass filter controlled by gamma.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'gamma', name: 'Gamma', type: IndicatorParameterType.Number,
        defaultValue: 0.8, min: 0.000001, max: 0.999999, step: 0.001,
    }],
    outputs: [{
        id: 'line', name: 'ALF',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#29b6f6',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new AdaptiveLaguerreFilterProcessor(
        parameter(parameters?.gamma, 0.8, 0.000001, 0.999999, 'gamma'),
    ),
});

export const LaguerreRsiIndicator: IndicatorDefinition<
    IndicatorCandle,
    LaguerreRsiParameters
> = registerIndicator({
    id: 'LaguerreRSI',
    name: 'Laguerre RSI',
    description: 'RSI-style oscillator calculated from a four-stage Laguerre filter.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'gamma', name: 'Gamma', type: IndicatorParameterType.Number,
        defaultValue: 0.7, min: 0.000001, max: 0.999999, step: 0.001,
    }],
    outputs: [{
        id: 'line', name: 'Laguerre RSI',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#7e57c2',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new LaguerreRsiProcessor(
        parameter(parameters?.gamma, 0.7, 0.000001, 0.999999, 'gamma'),
    ),
});

export const AdaptivePriceZoneIndicator: IndicatorDefinition<
    IndicatorCandle,
    AdaptivePriceZoneParameters
> = registerIndicator({
    id: 'AdaptivePriceZone',
    name: 'Adaptive Price Zone',
    description: 'Exponential moving average surrounded by population-deviation price bands.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'period', name: 'Period', type: IndicatorParameterType.Integer,
            defaultValue: 5, min: 1, max: 500, step: 1,
        },
        {
            id: 'bandPercentage', name: 'Band Percentage',
            type: IndicatorParameterType.Number,
            defaultValue: 2, min: 0, max: 500, step: 0.1,
        },
    ],
    outputs: [
        {
            id: 'ma', name: 'Moving Average',
            defaultStyle: {
                series: IndicatorSeriesStyle.Line,
                color: '#ffca28',
                lineWidth: 2,
                options: { priceLineVisible: false },
            },
        },
        {
            id: 'upper', name: 'Upper',
            defaultStyle: {
                series: IndicatorSeriesStyle.Band,
                color: '#42a5f5',
                options: { priceLineVisible: false },
            },
        },
        {
            id: 'lower', name: 'Lower',
            defaultStyle: {
                series: IndicatorSeriesStyle.Band,
                color: '#42a5f5',
                options: { priceLineVisible: false },
            },
        },
    ],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new AdaptivePriceZoneProcessor(
        integer(parameters?.period, 5, 1, 500, 'period'),
        parameter(parameters?.bandPercentage, 2, 0, 500, 'bandPercentage'),
    ),
});

export const AdaptiveIndicators = Object.freeze([
    ParabolicSarIndicator,
    McGinleyDynamicIndicator,
    NickRypockTrailingReverseIndicator,
    OptimalTrackingIndicator,
    SuperTrendIndicator,
    VidyaIndicator,
    VariableMovingAverageIndicator,
    KaufmanAdaptiveMovingAverageIndicator,
    KaufmanEfficiencyRatioIndicator,
    FractalAdaptiveMovingAverageIndicator,
    AdaptiveLaguerreFilterIndicator,
    LaguerreRsiIndicator,
    AdaptivePriceZoneIndicator,
] as const);
