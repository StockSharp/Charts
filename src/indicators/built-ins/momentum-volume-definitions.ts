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
    type SequentialIndicatorCheckpoint,
} from '../sequential-processor.js';
import {
    ExponentialMovingAverage,
    RingBuffer,
    RollingLinearRegression,
    RollingMaximum,
    RollingMinimum,
    RollingSum,
    SimpleMovingAverage,
    SmoothedMovingAverage,
    type RingBufferCheckpoint,
    type RollingWindowCheckpoint,
    type RollingLinearRegressionCheckpoint,
    type SeededMovingAverageCheckpoint,
    type SmoothedMovingAverageCheckpoint,
} from '../math/index.js';

export interface MomentumLengthParameters extends IndicatorParameters {
    readonly length: number;
}

export interface MomentumOfMovingAverageParameters extends IndicatorParameters {
    readonly length: number;
    readonly momentumPeriod: number;
}

export interface OscillatorOfMovingAverageParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
}

export interface RelativeMomentumIndexParameters extends IndicatorParameters {
    readonly length: number;
    readonly momentumPeriod: number;
}

export interface RangeActionVerificationIndexParameters extends IndicatorParameters {
    readonly shortLength: number;
    readonly longLength: number;
}

export interface PercentageVolumeOscillatorParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
}

export interface PercentageVolumeOscillatorCheckpoint {
    readonly short: SeededMovingAverageCheckpoint;
    readonly long: SeededMovingAverageCheckpoint;
}

export interface TwiggsMoneyFlowCheckpoint {
    readonly advanceDecline: SeededMovingAverageCheckpoint;
    readonly volume: SeededMovingAverageCheckpoint;
    readonly previousAdvanceDecline: number;
}

export interface UltimateOscillatorCheckpoint {
    readonly previousClose: number | null;
    readonly buyingPressure: readonly RollingWindowCheckpoint[];
    readonly trueRange: readonly RollingWindowCheckpoint[];
}

export interface MomentumOfMovingAverageCheckpoint {
    readonly values: RingBufferCheckpoint<number>;
    readonly sum: number;
}

export interface OscillatorOfMovingAverageCheckpoint {
    readonly shortAverage: RollingWindowCheckpoint;
    readonly longAverage: RollingWindowCheckpoint;
}

export interface PrettyGoodOscillatorCheckpoint {
    readonly average: RollingWindowCheckpoint;
    readonly highest: RollingWindowCheckpoint;
    readonly lowest: RollingWindowCheckpoint;
}

export interface RelativeMomentumIndexCheckpoint {
    readonly prices: RingBufferCheckpoint<number | null>;
    readonly up: RollingWindowCheckpoint;
    readonly down: RollingWindowCheckpoint;
}

export interface RangeActionVerificationIndexCheckpoint {
    readonly shortAverage: RollingWindowCheckpoint;
    readonly longAverage: RollingWindowCheckpoint;
}

export interface NegativeVolumeIndexCheckpoint {
    readonly previousClose: number;
    readonly previousVolume: number;
    readonly value: number;
}

export interface PositiveVolumeIndexCheckpoint {
    readonly previousClose: number;
    readonly previousVolume: number;
    readonly value: number;
}

export interface PriceVolumeTrendCheckpoint {
    readonly previousClose: number;
    readonly value: number;
}

export interface PsychologicalLineCheckpoint {
    readonly closes: RingBufferCheckpoint<number>;
    readonly upCount: number;
}

export interface ChaikinOscillatorParameters extends IndicatorParameters {
    readonly fast: number;
    readonly slow: number;
}

export interface ConnorsRsiParameters extends IndicatorParameters {
    readonly rsiLength: number;
    readonly streakLength: number;
    readonly rocLength: number;
}

function resolvedLength(
    parameters: MomentumLengthParameters,
    fallback: number,
    minimum = 1,
): number {
    const value = parameters?.length ?? fallback;
    if (!Number.isInteger(value) || value < minimum || value > 500) {
        throw new RangeError(
            `sschart: indicator length must be an integer from ${minimum} to 500`,
        );
    }
    return value;
}

function resolvedPeriod(value: unknown, fallback: number, name: string, maximum = 500): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || (resolved as number) < 1
        || (resolved as number) > maximum) {
        throw new RangeError(`sschart: ${name} must be an integer from 1 to ${maximum}`);
    }
    return resolved as number;
}

function resolvedFinite(value: unknown, fallback: number, name: string): number {
    const resolved = value ?? fallback;
    if (typeof resolved !== 'number' || !Number.isFinite(resolved))
        throw new TypeError(`sschart: ${name} must be finite`);
    return resolved;
}

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function lineStyle(color: string) {
    return {
        series: IndicatorSeriesStyle.Line,
        color,
        lineWidth: 2,
        options: { priceLineVisible: false },
    } as const;
}

function rankCorrelation(values: readonly number[]): number {
    const count = values.length;
    const indices = Array.from({ length: count }, (_, index) => index)
        .sort((left, right) => values[left] - values[right]);
    const ranks = new Array<number>(count);
    for (let start = 0; start < count;) {
        let end = start + 1;
        while (end < count && values[indices[end]] === values[indices[start]]) end += 1;
        const rank = (start + 1 + end) / 2;
        for (let index = start; index < end; index += 1) ranks[indices[index]] = rank;
        start = end;
    }

    const mean = (count + 1) / 2;
    let numerator = 0;
    let priceSquares = 0;
    let timeSquares = 0;
    for (let index = 0; index < count; index += 1) {
        const priceDelta = ranks[index] - mean;
        const timeDelta = index + 1 - mean;
        numerator += priceDelta * timeDelta;
        priceSquares += priceDelta * priceDelta;
        timeSquares += timeDelta * timeDelta;
    }
    const denominator = Math.sqrt(priceSquares * timeSquares);
    return denominator === 0 ? 0 : numerator / denominator;
}

function lengthParameter(defaultValue: number, minimum = 1) {
    return {
        id: 'length',
        name: 'Length',
        type: IndicatorParameterType.Integer,
        defaultValue,
        min: minimum,
        max: 500,
        step: 1,
    } as const;
}

export interface RelativeStrengthIndexCheckpoint {
    readonly previousClose: number | null;
    readonly validDeltas: number;
    readonly gain: SmoothedMovingAverageCheckpoint;
    readonly loss: SmoothedMovingAverageCheckpoint;
}

export interface DynamicZonesRsiParameters extends IndicatorParameters {
    readonly length: number;
    readonly oversoldLevel: number;
    readonly overboughtLevel: number;
}

export interface DynamicZonesRsiCheckpoint {
    readonly rsi: SequentialIndicatorCheckpoint<RelativeStrengthIndexCheckpoint>;
    readonly minimum: RollingWindowCheckpoint;
    readonly maximum: RollingWindowCheckpoint;
}

export interface DeMarkerCheckpoint {
    readonly previousHigh: number | null;
    readonly previousLow: number | null;
    readonly deMax: RollingWindowCheckpoint;
    readonly deMin: RollingWindowCheckpoint;
}

export interface DemandIndexCheckpoint {
    readonly previousClose: number;
    readonly previousVolume: number;
    readonly previousValue: number | null;
    readonly average: RollingWindowCheckpoint;
}

export class DemandIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    DemandIndexCheckpoint
> {
    private previousClose = 0;
    private previousVolume = 0;
    private previousValue: number | null = null;
    private readonly average: SimpleMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        this.average = new SimpleMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume);
        if (close === null || volume === null) return this.empty(input.index);

        if (this.previousClose === 0 || this.previousVolume === 0) {
            if (commit) {
                this.previousClose = close;
                this.previousVolume = volume;
            }
            return this.empty(input.index);
        }

        const priceDelta = close - this.previousClose;
        const volumeDelta = volume - this.previousVolume;
        if (priceDelta === 0 || volumeDelta === 0) {
            return {
                isFormed: this.previousValue !== null,
                values: [this.output('line', this.previousValue, input.index)],
            };
        }

        const logPriceDelta = Math.log(Math.abs(priceDelta));
        const logVolumeDelta = Math.log(Math.abs(volumeDelta));
        const divisor = logPriceDelta - logVolumeDelta;
        const raw = (divisor === 0 ? 0 : logPriceDelta * logVolumeDelta / divisor)
            * Math.sign(priceDelta);
        const value = commit
            ? this.average.push(raw)
            : this.average.preview(raw);
        if (commit) {
            this.previousClose = close;
            this.previousVolume = volume;
            if (value !== null) this.previousValue = value;
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.previousClose = 0;
        this.previousVolume = 0;
        this.previousValue = null;
        this.average.reset();
    }

    protected captureState(): DemandIndexCheckpoint {
        return Object.freeze({
            previousClose: this.previousClose,
            previousVolume: this.previousVolume,
            previousValue: this.previousValue,
            average: this.average.checkpoint(),
        });
    }

    protected restoreState(state: DemandIndexCheckpoint): void {
        const values = state?.average?.values;
        const rebuilt = Array.isArray(values)
            ? values.reduce((sum, value) => sum + (value ?? 0), 0) / this.length
            : null;
        const tolerance = rebuilt === null
            ? 0
            : Math.max(1, Math.abs(rebuilt)) * Number.EPSILON * 128;
        if (state === null || typeof state !== 'object'
            || finite(state.previousClose) === null
            || finite(state.previousVolume) === null
            || (state.previousValue !== null && finite(state.previousValue) === null)
            || !Array.isArray(values) || values.length > this.length
            || values.some((value) => finite(value) === null)
            || ((values.length === this.length) !== (state.previousValue !== null))
            || (state.previousValue !== null
                && Math.abs(state.previousValue - rebuilt!) > tolerance)) {
            throw new TypeError('sschart: invalid Demand Index checkpoint');
        }
        this.average.restore(state.average);
        this.previousClose = state.previousClose;
        this.previousVolume = state.previousVolume;
        this.previousValue = state.previousValue;
    }

    private empty(index: number): IndicatorCalculationResult {
        return {
            isFormed: false,
            values: [this.output('line', null, index)],
        };
    }
}

export class DisparityIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly average: SimpleMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        this.average = new SimpleMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const average = commit
            ? this.average.push(close)
            : this.average.preview(close);
        const value = close === null || average === null || average === 0
            ? null
            : finite((close - average) / average * 100);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.values) || state.values.length > this.length
            || state.values.some((value) => value !== null && finite(value) === null)) {
            throw new TypeError('sschart: invalid Disparity Index checkpoint');
        }
        this.average.restore(state);
    }
}

export class DeMarkerProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    DeMarkerCheckpoint
> {
    private previousHigh: number | null = null;
    private previousLow: number | null = null;
    private readonly deMax: SimpleMovingAverage;
    private readonly deMin: SimpleMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        this.deMax = new SimpleMovingAverage(length);
        this.deMin = new SimpleMovingAverage(length);
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
                values: [this.output('line', null, input.index)],
            };
        }

        if (this.previousHigh === null || this.previousLow === null) {
            if (commit) {
                this.previousHigh = high;
                this.previousLow = low;
            }
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const currentDeMax = high > this.previousHigh ? high - this.previousHigh : 0;
        const currentDeMin = low < this.previousLow ? this.previousLow - low : 0;
        const averageDeMax = commit
            ? this.deMax.push(currentDeMax)
            : this.deMax.preview(currentDeMax);
        const averageDeMin = commit
            ? this.deMin.push(currentDeMin)
            : this.deMin.preview(currentDeMin);
        if (commit) {
            this.previousHigh = high;
            this.previousLow = low;
        }

        const denominator = averageDeMax === null || averageDeMin === null
            ? null
            : averageDeMax + averageDeMin;
        const value = denominator === null
            ? null
            : denominator === 0 ? 0.5 : averageDeMax! / denominator;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.previousHigh = null;
        this.previousLow = null;
        this.deMax.reset();
        this.deMin.reset();
    }

    protected captureState(): DeMarkerCheckpoint {
        return Object.freeze({
            previousHigh: this.previousHigh,
            previousLow: this.previousLow,
            deMax: this.deMax.checkpoint(),
            deMin: this.deMin.checkpoint(),
        });
    }

    protected restoreState(state: DeMarkerCheckpoint): void {
        const validWindow = (checkpoint: RollingWindowCheckpoint) => (
            checkpoint !== null
            && typeof checkpoint === 'object'
            && Array.isArray(checkpoint.values)
            && checkpoint.values.length <= this.length
            && checkpoint.values.every((value) => finite(value) !== null)
        );
        const seeded = state?.previousHigh !== null && state?.previousLow !== null;
        if (state === null || typeof state !== 'object'
            || (state.previousHigh !== null && finite(state.previousHigh) === null)
            || (state.previousLow !== null && finite(state.previousLow) === null)
            || ((state.previousHigh === null) !== (state.previousLow === null))
            || !validWindow(state.deMax) || !validWindow(state.deMin)
            || state.deMax.values.length !== state.deMin.values.length
            || (!seeded && state.deMax.values.length !== 0)) {
            throw new TypeError('sschart: invalid DeMarker checkpoint');
        }
        this.deMax.restore(state.deMax);
        this.deMin.restore(state.deMin);
        this.previousHigh = state.previousHigh;
        this.previousLow = state.previousLow;
    }
}

export class RelativeStrengthIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RelativeStrengthIndexCheckpoint
> {
    private previousClose: number | null = null;
    private validDeltas = 0;
    private readonly gain: SmoothedMovingAverage;
    private readonly loss: SmoothedMovingAverage;

    constructor(readonly length: number) {
        super(['oscillator']);
        this.gain = new SmoothedMovingAverage(length);
        this.loss = new SmoothedMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const delta = close === null || this.previousClose === null
            ? null
            : close - this.previousClose;
        const averageGain = commit
            ? this.gain.push(delta === null ? null : Math.max(delta, 0))
            : this.gain.preview(delta === null ? null : Math.max(delta, 0));
        const averageLoss = commit
            ? this.loss.push(delta === null ? null : Math.max(-delta, 0))
            : this.loss.preview(delta === null ? null : Math.max(-delta, 0));
        if (commit) {
            this.previousClose = close;
            if (delta !== null) this.validDeltas = Math.min(this.length, this.validDeltas + 1);
        }

        let value: number | null = null;
        const formed = commit
            ? this.validDeltas >= this.length
            : this.validDeltas + (delta === null ? 0 : 1) >= this.length;
        if (formed && averageGain !== null && averageLoss !== null) {
            const total = averageGain + averageLoss;
            value = total === 0 ? 50 : 100 * averageGain / total;
        }
        return {
            isFormed: value !== null,
            values: [this.output('oscillator', value, input.index)],
        };
    }

    protected resetState(): void {
        this.previousClose = null;
        this.validDeltas = 0;
        this.gain.reset();
        this.loss.reset();
    }

    protected captureState(): RelativeStrengthIndexCheckpoint {
        return Object.freeze({
            previousClose: this.previousClose,
            validDeltas: this.validDeltas,
            gain: this.gain.checkpoint(),
            loss: this.loss.checkpoint(),
        });
    }

    protected restoreState(state: RelativeStrengthIndexCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || (state.previousClose !== null && finite(state.previousClose) === null)
            || !Number.isInteger(state.validDeltas)
            || state.validDeltas < 0 || state.validDeltas > this.length
            || state.gain?.count !== state.validDeltas
            || state.loss?.count !== state.validDeltas) {
            throw new TypeError('sschart: invalid RSI checkpoint');
        }
        this.gain.restore(state.gain);
        this.loss.restore(state.loss);
        this.previousClose = state.previousClose;
        this.validDeltas = state.validDeltas;
    }
}

export class DynamicZonesRsiProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    DynamicZonesRsiCheckpoint
> {
    private readonly rsi: RelativeStrengthIndexProcessor;
    private readonly minimum: RollingMinimum;
    private readonly maximum: RollingMaximum;

    constructor(
        readonly length: number,
        readonly oversoldLevel: number,
        readonly overboughtLevel: number,
    ) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        if (finite(oversoldLevel) === null || finite(overboughtLevel) === null) {
            throw new TypeError('sschart: Dynamic Zones RSI levels must be finite');
        }
        this.rsi = new RelativeStrengthIndexProcessor(length);
        this.minimum = new RollingMinimum(length);
        this.maximum = new RollingMaximum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const rsi = this.rsi.process(input).values[0]?.value ?? null;
        if (rsi === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const minimum = commit ? this.minimum.push(rsi) : this.minimum.preview(rsi);
        const maximum = commit ? this.maximum.push(rsi) : this.maximum.preview(rsi);
        if (minimum === null || maximum === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const range = maximum - minimum;
        const dynamicOversold = minimum + range * this.oversoldLevel / 100;
        const dynamicOverbought = minimum + range * this.overboughtLevel / 100;
        const value = rsi <= dynamicOversold
            ? 0
            : rsi >= dynamicOverbought
                ? 100
                : (rsi - dynamicOversold) / (dynamicOverbought - dynamicOversold) * 100;
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.rsi.reset();
        this.minimum.reset();
        this.maximum.reset();
    }

    protected captureState(): DynamicZonesRsiCheckpoint {
        return Object.freeze({
            rsi: this.rsi.checkpoint(),
            minimum: this.minimum.checkpoint(),
            maximum: this.maximum.checkpoint(),
        });
    }

    protected restoreState(state: DynamicZonesRsiCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || state.minimum?.values?.length !== state.maximum?.values?.length
            || state.minimum?.values?.length > this.length) {
            throw new TypeError('sschart: invalid Dynamic Zones RSI checkpoint');
        }
        this.rsi.restore(state.rsi);
        this.minimum.restore(state.minimum);
        this.maximum.restore(state.maximum);
    }
}

export interface PriceBufferCheckpoint {
    readonly prices: RingBufferCheckpoint<number | null>;
}

abstract class BufferedPriceProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    PriceBufferCheckpoint
> {
    protected readonly prices: RingBuffer<number | null>;

    protected constructor(readonly length: number, outputId: string) {
        super([outputId]);
        if (!Number.isInteger(length) || length < 1)
            throw new RangeError('sschart: buffered price length must be a positive integer');
        this.prices = new RingBuffer(length + 1);
    }

    protected past(): number | null | undefined {
        if (this.prices.size < this.length) return undefined;
        return this.prices.at(this.prices.size - this.length);
    }

    protected resetState(): void { this.prices.clear(); }
    protected captureState(): PriceBufferCheckpoint {
        return Object.freeze({ prices: this.prices.checkpoint() });
    }
    protected restoreState(state: PriceBufferCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid buffered price checkpoint');
        this.prices.restore(state.prices);
    }
}

export class MomentumProcessor extends BufferedPriceProcessor {
    constructor(length: number) { super(length, 'line'); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const past = this.past();
        const value = close !== null && typeof past === 'number'
            ? close - past
            : null;
        if (commit && close !== null) this.prices.push(close);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }
}

export class QStickProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly average: SimpleMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        this.average = new SimpleMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const open = finite(input.value?.open);
        const close = finite(input.value?.close);
        const difference = open === null || close === null ? null : open - close;
        const value = commit
            ? this.average.push(difference)
            : this.average.preview(difference);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.values) || state.values.length > this.length
            || state.values.some((value) => value !== null && finite(value) === null)) {
            throw new TypeError('sschart: invalid QStick checkpoint');
        }
        this.average.restore(state);
    }
}

export class MomentumOfMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    MomentumOfMovingAverageCheckpoint
> {
    private readonly values: RingBuffer<number>;
    private sum = 0;

    constructor(readonly length: number, readonly momentumPeriod: number) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        resolvedPeriod(momentumPeriod, momentumPeriod, 'momentumPeriod');
        this.values = new RingBuffer(length);
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

        let value: number | null = null;
        if (commit) {
            this.push(price);
            const average = this.sum / this.length;
            if (this.values.full) {
                this.push(average);
                const first = this.values.front() as number;
                if (first !== 0) value = finite((average - first) / first * 100);
            }
        } else {
            const wasFull = this.values.full;
            const nextSize = Math.min(this.length, this.values.size + 1);
            const outgoing = wasFull ? (this.values.front() as number) : 0;
            const nextSum = this.sum - outgoing + price;
            if (nextSize === this.length) {
                const average = nextSum / this.length;
                let first: number;
                if (this.length === 1) {
                    first = average;
                } else if (wasFull) {
                    first = this.length === 2
                        ? price
                        : (this.values.at(2) as number);
                } else {
                    first = this.length === 2
                        ? price
                        : (this.values.at(1) as number);
                }
                if (first !== 0) value = finite((average - first) / first * 100);
            }
        }

        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.values.clear();
        this.sum = 0;
    }

    protected captureState(): MomentumOfMovingAverageCheckpoint {
        return Object.freeze({ values: this.values.checkpoint(), sum: this.sum });
    }

    protected restoreState(state: MomentumOfMovingAverageCheckpoint): void {
        const values = state?.values?.values;
        const rebuiltSum = Array.isArray(values)
            ? values.reduce((sum, value) => sum + value, 0)
            : 0;
        const tolerance = Math.max(1, Math.abs(rebuiltSum)) * Number.EPSILON * 128;
        if (state === null || typeof state !== 'object'
            || !Array.isArray(values) || values.length > this.length
            || values.some((value) => finite(value) === null)
            || finite(state.sum) === null
            || Math.abs(state.sum - rebuiltSum) > tolerance) {
            throw new TypeError('sschart: invalid Momentum Of Moving Average checkpoint');
        }
        this.values.restore(state.values);
        this.sum = state.sum;
    }

    private push(value: number): void {
        if (this.values.full) this.sum -= this.values.front() as number;
        this.values.push(value);
        this.sum += value;
    }
}

export class OscillatorOfMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    OscillatorOfMovingAverageCheckpoint
> {
    private readonly shortAverage: SimpleMovingAverage;
    private readonly longAverage: SimpleMovingAverage;

    constructor(readonly shortPeriod: number, readonly longPeriod: number) {
        super(['line']);
        resolvedPeriod(shortPeriod, shortPeriod, 'shortPeriod');
        resolvedPeriod(longPeriod, longPeriod, 'longPeriod');
        this.shortAverage = new SimpleMovingAverage(shortPeriod);
        this.longAverage = new SimpleMovingAverage(longPeriod);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const short = commit
            ? this.shortAverage.push(close)
            : this.shortAverage.preview(close);
        const long = commit
            ? this.longAverage.push(close)
            : this.longAverage.preview(close);
        const value = short === null || long === null
            ? null
            : long === 0 ? 0 : finite((short - long) / long * 100);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.shortAverage.reset();
        this.longAverage.reset();
    }

    protected captureState(): OscillatorOfMovingAverageCheckpoint {
        return Object.freeze({
            shortAverage: this.shortAverage.checkpoint(),
            longAverage: this.longAverage.checkpoint(),
        });
    }

    protected restoreState(state: OscillatorOfMovingAverageCheckpoint): void {
        const valid = (checkpoint: RollingWindowCheckpoint, maximum: number) => (
            checkpoint !== null
            && typeof checkpoint === 'object'
            && Array.isArray(checkpoint.values)
            && checkpoint.values.length <= maximum
            && checkpoint.values.every((value) => value === null || finite(value) !== null)
        );
        if (state === null || typeof state !== 'object'
            || !valid(state.shortAverage, this.shortPeriod)
            || !valid(state.longAverage, this.longPeriod)) {
            throw new TypeError('sschart: invalid Oscillator Of Moving Average checkpoint');
        }
        this.shortAverage.restore(state.shortAverage);
        this.longAverage.restore(state.longAverage);
    }
}

export class PrettyGoodOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    PrettyGoodOscillatorCheckpoint
> {
    private readonly average: SimpleMovingAverage;
    private readonly highest: RollingMaximum;
    private readonly lowest: RollingMinimum;

    constructor(readonly length: number) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        this.average = new SimpleMovingAverage(length);
        this.highest = new RollingMaximum(length);
        this.lowest = new RollingMinimum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const average = commit ? this.average.push(close) : this.average.preview(close);
        const highest = commit ? this.highest.push(high) : this.highest.preview(high);
        const lowest = commit ? this.lowest.push(low) : this.lowest.preview(low);
        const range = highest === null || lowest === null ? null : highest - lowest;
        const value = close === null || average === null || range === null || range === 0
            ? null
            : finite((close - average) / range * 100);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.average.reset();
        this.highest.reset();
        this.lowest.reset();
    }

    protected captureState(): PrettyGoodOscillatorCheckpoint {
        return Object.freeze({
            average: this.average.checkpoint(),
            highest: this.highest.checkpoint(),
            lowest: this.lowest.checkpoint(),
        });
    }

    protected restoreState(state: PrettyGoodOscillatorCheckpoint): void {
        const valid = (checkpoint: RollingWindowCheckpoint) => (
            checkpoint !== null
            && typeof checkpoint === 'object'
            && Array.isArray(checkpoint.values)
            && checkpoint.values.length <= this.length
            && checkpoint.values.every((value) => value === null || finite(value) !== null)
        );
        if (state === null || typeof state !== 'object'
            || !valid(state.average) || !valid(state.highest) || !valid(state.lowest)) {
            throw new TypeError('sschart: invalid Pretty Good Oscillator checkpoint');
        }
        this.average.restore(state.average);
        this.highest.restore(state.highest);
        this.lowest.restore(state.lowest);
    }
}

export class RelativeMomentumIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RelativeMomentumIndexCheckpoint
> {
    private readonly prices: RingBuffer<number | null>;
    private readonly up: SimpleMovingAverage;
    private readonly down: SimpleMovingAverage;

    constructor(readonly length: number, readonly momentumPeriod: number) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        resolvedPeriod(momentumPeriod, momentumPeriod, 'momentumPeriod');
        this.prices = new RingBuffer(momentumPeriod + 1);
        this.up = new SimpleMovingAverage(length);
        this.down = new SimpleMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const past = this.prices.size < this.momentumPeriod
            ? null
            : (this.prices.at(this.prices.size - this.momentumPeriod) ?? null);
        const momentum = close === null || past === null ? null : close - past;
        const averageUp = commit
            ? this.up.push(momentum === null ? null : Math.max(momentum, 0))
            : this.up.preview(momentum === null ? null : Math.max(momentum, 0));
        const averageDown = commit
            ? this.down.push(momentum === null ? null : Math.max(-momentum, 0))
            : this.down.preview(momentum === null ? null : Math.max(-momentum, 0));
        if (commit) this.prices.push(close);

        const denominator = averageUp === null || averageDown === null
            ? 0
            : averageUp + averageDown;
        const value = averageUp === null || averageDown === null || denominator === 0
            ? null
            : 100 * averageUp / denominator;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.prices.clear();
        this.up.reset();
        this.down.reset();
    }

    protected captureState(): RelativeMomentumIndexCheckpoint {
        return Object.freeze({
            prices: this.prices.checkpoint(),
            up: this.up.checkpoint(),
            down: this.down.checkpoint(),
        });
    }

    protected restoreState(state: RelativeMomentumIndexCheckpoint): void {
        const valid = (checkpoint: RingBufferCheckpoint<number | null>, maximum: number) => (
            checkpoint !== null
            && typeof checkpoint === 'object'
            && Array.isArray(checkpoint.values)
            && checkpoint.values.length <= maximum
            && checkpoint.values.every((value) => value === null || finite(value) !== null)
        );
        if (state === null || typeof state !== 'object'
            || !valid(state.prices, this.momentumPeriod + 1)
            || !valid(state.up, this.length) || !valid(state.down, this.length)) {
            throw new TypeError('sschart: invalid Relative Momentum Index checkpoint');
        }
        this.prices.restore(state.prices);
        this.up.restore(state.up);
        this.down.restore(state.down);
    }
}

export class RangeActionVerificationIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RangeActionVerificationIndexCheckpoint
> {
    private readonly shortAverage: SimpleMovingAverage;
    private readonly longAverage: SimpleMovingAverage;

    constructor(readonly shortLength: number, readonly longLength: number) {
        super(['line']);
        resolvedPeriod(shortLength, shortLength, 'shortLength');
        resolvedPeriod(longLength, longLength, 'longLength', 650);
        this.shortAverage = new SimpleMovingAverage(shortLength);
        this.longAverage = new SimpleMovingAverage(longLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const short = commit
            ? this.shortAverage.push(close)
            : this.shortAverage.preview(close);
        const long = commit
            ? this.longAverage.push(close)
            : this.longAverage.preview(close);
        const value = short === null || long === null || long === 0
            ? null
            : finite(Math.abs(100 * (short - long) / long));
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.shortAverage.reset();
        this.longAverage.reset();
    }

    protected captureState(): RangeActionVerificationIndexCheckpoint {
        return Object.freeze({
            shortAverage: this.shortAverage.checkpoint(),
            longAverage: this.longAverage.checkpoint(),
        });
    }

    protected restoreState(state: RangeActionVerificationIndexCheckpoint): void {
        const valid = (checkpoint: RollingWindowCheckpoint, maximum: number) => (
            checkpoint !== null
            && typeof checkpoint === 'object'
            && Array.isArray(checkpoint.values)
            && checkpoint.values.length <= maximum
            && checkpoint.values.every((value) => value === null || finite(value) !== null)
        );
        if (state === null || typeof state !== 'object'
            || !valid(state.shortAverage, this.shortLength)
            || !valid(state.longAverage, this.longLength)) {
            throw new TypeError('sschart: invalid Range Action Verification Index checkpoint');
        }
        this.shortAverage.restore(state.shortAverage);
        this.longAverage.restore(state.longAverage);
    }
}

export class RankCorrelationIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RingBufferCheckpoint<number | null>
> {
    private readonly prices: RingBuffer<number | null>;

    constructor(readonly length: number) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        if (length < 2)
            throw new RangeError('sschart: Rank Correlation Index length must be at least 2');
        this.prices = new RingBuffer(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const previous = this.prices.toArray();
        const window = this.prices.full ? previous.slice(1) : previous;
        window.push(close);
        const value = window.length === this.length
            && window.every((item): item is number => item !== null)
            ? finite(rankCorrelation(window))
            : null;
        if (commit) this.prices.push(close);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.prices.clear(); }
    protected captureState(): RingBufferCheckpoint<number | null> {
        return this.prices.checkpoint();
    }
    protected restoreState(state: RingBufferCheckpoint<number | null>): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.values) || state.values.length > this.length
            || state.values.some((value) => value !== null && finite(value) === null)) {
            throw new TypeError('sschart: invalid Rank Correlation Index checkpoint');
        }
        this.prices.restore(state);
    }
}

export class MomentumPinballProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RingBufferCheckpoint<number>
> {
    private readonly values: RingBuffer<number>;
    private readonly minimum: RollingMinimum;
    private readonly maximum: RollingMaximum;

    constructor(readonly length: number) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        this.values = new RingBuffer(length);
        this.minimum = new RollingMinimum(length);
        this.maximum = new RollingMaximum(length);
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

        const minimum = commit ? this.minimum.push(price) : this.minimum.preview(price);
        const maximum = commit ? this.maximum.push(price) : this.maximum.preview(price);
        const nextSize = Math.min(this.length, this.values.size + 1);
        let oldest: number | null = null;
        if (nextSize === this.length) {
            oldest = this.values.full
                ? (this.length === 1 ? price : (this.values.at(1) as number))
                : (this.values.front() ?? price);
        }
        if (commit) this.values.push(price);

        let value: number | null = null;
        if (minimum !== null && maximum !== null && oldest !== null) {
            const range = maximum - minimum;
            value = range === 0 ? 0 : finite((price - oldest) / range * 100);
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.values.clear();
        this.minimum.reset();
        this.maximum.reset();
    }

    protected captureState(): RingBufferCheckpoint<number> {
        return this.values.checkpoint();
    }

    protected restoreState(state: RingBufferCheckpoint<number>): void {
        const values = state?.values;
        if (!Array.isArray(values) || values.length > this.length
            || values.some((value) => finite(value) === null)) {
            throw new TypeError('sschart: invalid Momentum Pinball checkpoint');
        }
        this.resetState();
        for (const value of values) {
            this.values.push(value);
            this.minimum.push(value);
            this.maximum.push(value);
        }
    }
}

export class RateOfChangeProcessor extends BufferedPriceProcessor {
    constructor(length: number) { super(length, 'line'); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const past = this.past();
        const value = close !== null && typeof past === 'number' && past !== 0
            ? (close - past) / past * 100
            : null;
        if (commit) this.prices.push(close);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }
}

export interface MoneyFlowIndexCheckpoint {
    readonly previousTypical: number;
    readonly positive: RollingWindowCheckpoint;
    readonly negative: RollingWindowCheckpoint;
}

export interface WilliamsRCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}

export interface StochasticKCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}

export class WilliamsRProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    WilliamsRCheckpoint
> {
    private readonly high: RollingMaximum;
    private readonly low: RollingMinimum;

    constructor(readonly length: number) {
        super(['line']);
        this.high = new RollingMaximum(length);
        this.low = new RollingMinimum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = commit
            ? this.high.push(finite(input.value?.high))
            : this.high.preview(finite(input.value?.high));
        const low = commit
            ? this.low.push(finite(input.value?.low))
            : this.low.preview(finite(input.value?.low));
        const close = finite(input.value?.close);
        let value: number | null = null;
        if (high !== null && low !== null && close !== null) {
            const range = high - low;
            value = range === 0 ? -100 : -100 * (high - close) / range;
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.high.reset();
        this.low.reset();
    }
    protected captureState(): WilliamsRCheckpoint {
        return Object.freeze({
            high: this.high.checkpoint(),
            low: this.low.checkpoint(),
        });
    }
    protected restoreState(state: WilliamsRCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || state.high?.values?.length !== state.low?.values?.length) {
            throw new TypeError('sschart: invalid Williams R checkpoint');
        }
        this.high.restore(state.high);
        this.low.restore(state.low);
    }
}

export class StochasticKProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    StochasticKCheckpoint
> {
    private readonly high: RollingMaximum;
    private readonly low: RollingMinimum;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Stochastic K length must be an integer from 1 to 500',
            );
        }
        this.high = new RollingMaximum(length);
        this.low = new RollingMinimum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = commit
            ? this.high.push(finite(input.value?.high))
            : this.high.preview(finite(input.value?.high));
        const low = commit
            ? this.low.push(finite(input.value?.low))
            : this.low.preview(finite(input.value?.low));
        const close = finite(input.value?.close);
        let value: number | null = null;
        if (high !== null && low !== null && close !== null) {
            const range = high - low;
            value = range === 0 ? 0 : finite(100 * (close - low) / range);
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.high.reset();
        this.low.reset();
    }

    protected captureState(): StochasticKCheckpoint {
        return Object.freeze({
            high: this.high.checkpoint(),
            low: this.low.checkpoint(),
        });
    }

    protected restoreState(state: StochasticKCheckpoint): void {
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
            throw new TypeError('sschart: invalid Stochastic K checkpoint');
        }
        this.high.restore(state.high);
        this.low.restore(state.low);
    }
}

export class PercentageVolumeOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    PercentageVolumeOscillatorCheckpoint
> {
    private readonly short: ExponentialMovingAverage;
    private readonly long: ExponentialMovingAverage;

    constructor(readonly shortPeriod: number, readonly longPeriod: number) {
        super(['shortEma', 'longEma', 'pvo']);
        resolvedPeriod(shortPeriod, shortPeriod, 'shortPeriod');
        resolvedPeriod(longPeriod, longPeriod, 'longPeriod');
        this.short = new ExponentialMovingAverage(shortPeriod);
        this.long = new ExponentialMovingAverage(longPeriod);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const volume = finite(input.value?.volume);
        const short = commit ? this.short.push(volume) : this.short.preview(volume);
        const long = commit ? this.long.push(volume) : this.long.preview(volume);
        const pvo = short === null || long === null
            ? null
            : (long === 0 ? 0 : finite((short - long) / long * 100));
        return {
            isFormed: pvo !== null,
            values: [
                this.output('shortEma', short, input.index),
                this.output('longEma', long, input.index),
                this.output('pvo', pvo, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.short.reset();
        this.long.reset();
    }

    protected captureState(): PercentageVolumeOscillatorCheckpoint {
        return Object.freeze({
            short: this.short.checkpoint(),
            long: this.long.checkpoint(),
        });
    }

    protected restoreState(state: PercentageVolumeOscillatorCheckpoint): void {
        if (state === null || typeof state !== 'object') {
            throw new TypeError('sschart: invalid Percentage Volume Oscillator checkpoint');
        }
        this.short.restore(state.short);
        this.long.restore(state.long);
    }
}

export class TwiggsMoneyFlowProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    TwiggsMoneyFlowCheckpoint
> {
    private readonly advanceDecline: ExponentialMovingAverage;
    private readonly volume: ExponentialMovingAverage;
    private previousAdvanceDecline = 0;

    constructor(readonly length: number) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        this.advanceDecline = new ExponentialMovingAverage(length);
        this.volume = new ExponentialMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const incomingVolume = finite(input.value?.volume);
        if (high === null || low === null || close === null || incomingVolume === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const range = high - low;
        const typical = (high + low + close) / 3;
        const advanceDecline = range === 0
            ? this.previousAdvanceDecline
            : finite(incomingVolume * (2 * typical - high - low) / range);
        if (advanceDecline === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const averageAdvanceDecline = commit
            ? this.advanceDecline.push(advanceDecline)
            : this.advanceDecline.preview(advanceDecline);
        const averageVolume = commit
            ? this.volume.push(incomingVolume)
            : this.volume.preview(incomingVolume);
        if (commit) this.previousAdvanceDecline = advanceDecline;

        const formed = averageAdvanceDecline !== null && averageVolume !== null;
        const ratio = !formed || averageVolume === 0
            ? null
            : finite(averageAdvanceDecline / averageVolume);
        const value = ratio === 0 ? null : ratio;
        return {
            isFormed: formed,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.advanceDecline.reset();
        this.volume.reset();
        this.previousAdvanceDecline = 0;
    }

    protected captureState(): TwiggsMoneyFlowCheckpoint {
        return Object.freeze({
            advanceDecline: this.advanceDecline.checkpoint(),
            volume: this.volume.checkpoint(),
            previousAdvanceDecline: this.previousAdvanceDecline,
        });
    }

    protected restoreState(state: TwiggsMoneyFlowCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.previousAdvanceDecline) === null
            || state.advanceDecline?.count !== state.volume?.count
            || state.advanceDecline?.formed !== state.volume?.formed) {
            throw new TypeError('sschart: invalid Twiggs Money Flow checkpoint');
        }
        this.advanceDecline.restore(state.advanceDecline);
        this.volume.restore(state.volume);
        this.previousAdvanceDecline = state.previousAdvanceDecline;
    }
}

const ULTIMATE_OSCILLATOR_PERIODS = Object.freeze([7, 14, 28]);
const ULTIMATE_OSCILLATOR_WEIGHTS = Object.freeze([4, 2, 1]);

export class UltimateOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    UltimateOscillatorCheckpoint
> {
    private previousClose: number | null = null;
    private readonly buyingPressure = ULTIMATE_OSCILLATOR_PERIODS.map(
        (period) => new RollingSum(period),
    );
    private readonly trueRange = ULTIMATE_OSCILLATOR_PERIODS.map(
        (period) => new RollingSum(period),
    );

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const valid = high !== null && low !== null && close !== null;
        const minimum = valid && this.previousClose !== null
            ? Math.min(low, this.previousClose)
            : null;
        const maximum = valid && this.previousClose !== null
            ? Math.max(high, this.previousClose)
            : null;
        const buyingPressure = minimum === null ? null : close! - minimum;
        const trueRange = minimum === null || maximum === null ? null : maximum - minimum;
        const buyingPressureSums = this.buyingPressure.map((sum) => (
            commit ? sum.push(buyingPressure) : sum.preview(buyingPressure)
        ));
        const trueRangeSums = this.trueRange.map((sum) => (
            commit ? sum.push(trueRange) : sum.preview(trueRange)
        ));
        if (commit && valid) this.previousClose = close;

        const formed = buyingPressureSums.every((value) => value !== null)
            && trueRangeSums.every((value) => value !== null);
        let value: number | null = null;
        if (formed && trueRangeSums.every((sum) => sum !== 0)) {
            const weighted = ULTIMATE_OSCILLATOR_WEIGHTS.reduce((total, weight, index) => (
                total + weight * buyingPressureSums[index]! / trueRangeSums[index]!
            ), 0);
            value = finite(100 * weighted / 7);
        }
        return {
            isFormed: formed,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.previousClose = null;
        this.buyingPressure.forEach((sum) => sum.reset());
        this.trueRange.forEach((sum) => sum.reset());
    }

    protected captureState(): UltimateOscillatorCheckpoint {
        return Object.freeze({
            previousClose: this.previousClose,
            buyingPressure: Object.freeze(this.buyingPressure.map((sum) => sum.checkpoint())),
            trueRange: Object.freeze(this.trueRange.map((sum) => sum.checkpoint())),
        });
    }

    protected restoreState(state: UltimateOscillatorCheckpoint): void {
        const validWindows = (windows: readonly RollingWindowCheckpoint[]) => (
            Array.isArray(windows)
            && windows.length === ULTIMATE_OSCILLATOR_PERIODS.length
            && windows.every((window, index) => (
                window !== null
                && typeof window === 'object'
                && Array.isArray(window.values)
                && window.values.length <= ULTIMATE_OSCILLATOR_PERIODS[index]
                && window.values.every((value: number | null) => (
                    value === null || finite(value) !== null
                ))
            ))
        );
        if (state === null || typeof state !== 'object'
            || (state.previousClose !== null && finite(state.previousClose) === null)
            || !validWindows(state.buyingPressure) || !validWindows(state.trueRange)
            || state.buyingPressure.some((window, index) => (
                window.values.length !== state.trueRange[index].values.length
            ))) {
            throw new TypeError('sschart: invalid Ultimate Oscillator checkpoint');
        }
        this.buyingPressure.forEach((sum, index) => sum.restore(state.buyingPressure[index]));
        this.trueRange.forEach((sum, index) => sum.restore(state.trueRange[index]));
        this.previousClose = state.previousClose;
    }
}

export interface VolumeWeightedMovingAverageCheckpoint {
    readonly numerator: RollingWindowCheckpoint;
    readonly denominator: RollingWindowCheckpoint;
}

export interface ChaikinMoneyFlowCheckpoint {
    readonly moneyFlowVolumes: RingBufferCheckpoint<number | null>;
    readonly moneyFlowVolumeSum: number;
    readonly volumeSum: number;
    readonly invalid: number;
}

export interface ChaikinOscillatorCheckpoint {
    readonly accumulationDistribution: number;
    readonly fast: SeededMovingAverageCheckpoint;
    readonly slow: SeededMovingAverageCheckpoint;
}

export interface ChandeMomentumOscillatorCheckpoint {
    readonly initialized: boolean;
    readonly previousClose: number | null;
    readonly up: RollingWindowCheckpoint;
    readonly down: RollingWindowCheckpoint;
}

export interface ArrayRsiCheckpoint {
    readonly initialized: boolean;
    readonly previous: number | null;
    readonly gain: SmoothedMovingAverageCheckpoint;
    readonly loss: SmoothedMovingAverageCheckpoint;
}

class ArrayRsiKernel {
    private initialized = false;
    private previous: number | null = null;
    private readonly gain: SmoothedMovingAverage;
    private readonly loss: SmoothedMovingAverage;

    constructor(readonly length: number) {
        this.gain = new SmoothedMovingAverage(length);
        this.loss = new SmoothedMovingAverage(length);
    }

    push(value: number | null): number | null { return this.evaluate(value, true); }
    preview(value: number | null): number | null { return this.evaluate(value, false); }

    reset(): void {
        this.initialized = false;
        this.previous = null;
        this.gain.reset();
        this.loss.reset();
    }

    checkpoint(): ArrayRsiCheckpoint {
        return Object.freeze({
            initialized: this.initialized,
            previous: this.previous,
            gain: this.gain.checkpoint(),
            loss: this.loss.checkpoint(),
        });
    }

    restore(state: ArrayRsiCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || typeof state.initialized !== 'boolean'
            || (state.previous !== null && finite(state.previous) === null)
            || state.gain?.count !== state.loss?.count
            || (!state.initialized && (state.previous !== null || state.gain.count !== 0))) {
            throw new TypeError('sschart: invalid array RSI checkpoint');
        }
        this.gain.restore(state.gain);
        this.loss.restore(state.loss);
        this.initialized = state.initialized;
        this.previous = state.previous;
    }

    private evaluate(value: number | null, commit: boolean): number | null {
        if (!this.initialized) {
            if (value !== null && commit) {
                this.initialized = true;
                this.previous = value;
            }
            return null;
        }

        const delta = value === null || this.previous === null
            ? null
            : finite(value - this.previous);
        const gain = commit
            ? this.gain.push(delta === null ? null : Math.max(delta, 0))
            : this.gain.preview(delta === null ? null : Math.max(delta, 0));
        const loss = commit
            ? this.loss.push(delta === null ? null : Math.max(-delta, 0))
            : this.loss.preview(delta === null ? null : Math.max(-delta, 0));
        if (commit) this.previous = value;
        if (gain === null || loss === null) return null;
        const total = gain + loss;
        return total === 0 ? 50 : finite(100 * gain / total);
    }
}

export interface ConnorsRsiCheckpoint {
    readonly closeRsi: ArrayRsiCheckpoint;
    readonly streakRsi: ArrayRsiCheckpoint;
    readonly rocRsi: ArrayRsiCheckpoint;
    readonly rocHistory: RingBufferCheckpoint<number | null>;
    readonly streakPreviousPrice: number | null;
    readonly streakPrevious: number;
}

export interface EaseOfMovementCheckpoint {
    readonly previousHigh: number;
    readonly previousLow: number;
    readonly values: RollingWindowCheckpoint;
}

export interface ApprovalFlowIndexCheckpoint {
    readonly previousClose: number;
    readonly totalUp: number;
    readonly totalDown: number;
    readonly count: number;
    readonly formed: boolean;
}

export interface ForceIndexCheckpoint {
    readonly initialized: boolean;
    readonly previousClose: number | null;
    readonly average: SeededMovingAverageCheckpoint;
}

export interface HighLowIndexCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}

export interface IntradayMomentumIndexCheckpoint {
    readonly up: RollingWindowCheckpoint;
    readonly down: RollingWindowCheckpoint;
}

export class MoneyFlowIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    MoneyFlowIndexCheckpoint
> {
    private previousTypical = 0;
    private readonly positive: RollingSum;
    private readonly negative: RollingSum;

    constructor(readonly length: number) {
        super(['line']);
        this.positive = new RollingSum(length);
        this.negative = new RollingSum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume);
        const valid = high !== null && low !== null && close !== null && volume !== null;
        const typical = valid ? (high + low + close) / 3 : null;
        const flow = typical === null || volume === null ? 0 : typical * volume;
        const positive = typical !== null && typical > this.previousTypical ? flow : 0;
        const negative = typical !== null && typical < this.previousTypical ? flow : 0;
        const positiveSum = commit
            ? this.positive.push(positive)
            : this.positive.preview(positive);
        const negativeSum = commit
            ? this.negative.push(negative)
            : this.negative.preview(negative);
        if (commit && typical !== null) this.previousTypical = typical;

        let value: number | null = null;
        if (valid && positiveSum !== null && negativeSum !== null) {
            if (negativeSum === 0) value = 100;
            else {
                const total = positiveSum + negativeSum;
                value = total === 0 ? null : 100 * positiveSum / total;
            }
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.previousTypical = 0;
        this.positive.reset();
        this.negative.reset();
    }

    protected captureState(): MoneyFlowIndexCheckpoint {
        return Object.freeze({
            previousTypical: this.previousTypical,
            positive: this.positive.checkpoint(),
            negative: this.negative.checkpoint(),
        });
    }

    protected restoreState(state: MoneyFlowIndexCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.previousTypical) === null
            || state.positive?.values?.length !== state.negative?.values?.length) {
            throw new TypeError('sschart: invalid MFI checkpoint');
        }
        this.positive.restore(state.positive);
        this.negative.restore(state.negative);
        this.previousTypical = state.previousTypical;
    }
}

export class VolumeWeightedMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    VolumeWeightedMovingAverageCheckpoint
> {
    private readonly numerator: RollingSum;
    private readonly denominator: RollingSum;

    constructor(readonly length: number) {
        super(['line']);
        this.numerator = new RollingSum(length);
        this.denominator = new RollingSum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume);
        const valid = close !== null && volume !== null;
        const weighted = valid ? finite(close * volume) : null;
        const numerator = commit
            ? this.numerator.push(weighted)
            : this.numerator.preview(weighted);
        const denominator = commit
            ? this.denominator.push(valid ? volume : null)
            : this.denominator.preview(valid ? volume : null);
        const value = numerator !== null && denominator !== null && denominator !== 0
            ? numerator / denominator
            : null;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.numerator.reset();
        this.denominator.reset();
    }
    protected captureState(): VolumeWeightedMovingAverageCheckpoint {
        return Object.freeze({
            numerator: this.numerator.checkpoint(),
            denominator: this.denominator.checkpoint(),
        });
    }
    protected restoreState(state: VolumeWeightedMovingAverageCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || state.numerator?.values?.length !== state.denominator?.values?.length) {
            throw new TypeError('sschart: invalid VWMA checkpoint');
        }
        this.numerator.restore(state.numerator);
        this.denominator.restore(state.denominator);
    }
}

/**
 * StockSharp-compatible CMF, including its historical denominator-eviction
 * behavior: an expired money-flow volume is subtracted from both sums.
 */
export class ChaikinMoneyFlowProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ChaikinMoneyFlowCheckpoint
> {
    private readonly moneyFlowVolumes: RingBuffer<number | null>;
    private moneyFlowVolumeSum = 0;
    private volumeSum = 0;
    private invalid = 0;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1)
            throw new RangeError('sschart: CMF length must be a positive integer');
        this.moneyFlowVolumes = new RingBuffer(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume);
        const valid = high !== null && low !== null && close !== null && volume !== null;
        const range = valid ? high - low : 0;
        const multiplier = valid && range !== 0
            ? ((close - low) - (high - close)) / range
            : 0;
        const candidate = valid ? multiplier * volume : Number.NaN;
        const moneyFlowVolume = Number.isFinite(candidate) ? candidate : null;
        const outgoing = this.moneyFlowVolumes.full
            ? (this.moneyFlowVolumes.front() ?? null)
            : undefined;

        let nextMoneyFlowVolumeSum = this.moneyFlowVolumeSum;
        let nextVolumeSum = this.volumeSum;
        let nextInvalid = this.invalid;
        if (moneyFlowVolume === null) nextInvalid += 1;
        else {
            nextMoneyFlowVolumeSum += moneyFlowVolume;
            nextVolumeSum += volume ?? 0;
        }
        if (outgoing !== undefined) {
            if (outgoing === null) nextInvalid -= 1;
            else {
                nextMoneyFlowVolumeSum -= outgoing;
                nextVolumeSum -= outgoing;
            }
        }

        if (commit) {
            this.moneyFlowVolumes.push(moneyFlowVolume);
            this.moneyFlowVolumeSum = nextMoneyFlowVolumeSum;
            this.volumeSum = nextVolumeSum;
            this.invalid = nextInvalid;
        }

        const nextSize = Math.min(this.length, this.moneyFlowVolumes.size + (commit ? 0 : 1));
        const formed = nextSize === this.length && nextInvalid === 0;
        const candidateValue = formed
            ? (nextVolumeSum !== 0 ? nextMoneyFlowVolumeSum / nextVolumeSum : 0)
            : null;
        const value = finite(candidateValue);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.moneyFlowVolumes.clear();
        this.moneyFlowVolumeSum = 0;
        this.volumeSum = 0;
        this.invalid = 0;
    }

    protected captureState(): ChaikinMoneyFlowCheckpoint {
        return Object.freeze({
            moneyFlowVolumes: this.moneyFlowVolumes.checkpoint(),
            moneyFlowVolumeSum: this.moneyFlowVolumeSum,
            volumeSum: this.volumeSum,
            invalid: this.invalid,
        });
    }

    protected restoreState(state: ChaikinMoneyFlowCheckpoint): void {
        const values = state?.moneyFlowVolumes?.values;
        if (state === null || typeof state !== 'object'
            || !Array.isArray(values) || values.length > this.length
            || values.some((value) => value !== null && finite(value) === null)
            || finite(state.moneyFlowVolumeSum) === null
            || finite(state.volumeSum) === null
            || !Number.isInteger(state.invalid) || state.invalid < 0
            || state.invalid !== values.filter((value) => value === null).length) {
            throw new TypeError('sschart: invalid CMF checkpoint');
        }
        this.moneyFlowVolumes.restore(state.moneyFlowVolumes);
        this.moneyFlowVolumeSum = state.moneyFlowVolumeSum;
        this.volumeSum = state.volumeSum;
        this.invalid = state.invalid;
    }
}

export class ChaikinOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ChaikinOscillatorCheckpoint
> {
    private accumulationDistribution = 0;
    private readonly fast: ExponentialMovingAverage;
    private readonly slow: ExponentialMovingAverage;

    constructor(readonly fastLength: number, readonly slowLength: number) {
        super(['line']);
        if (!Number.isInteger(fastLength) || fastLength < 1)
            throw new RangeError('sschart: Chaikin fast length must be a positive integer');
        if (!Number.isInteger(slowLength) || slowLength < 1)
            throw new RangeError('sschart: Chaikin slow length must be a positive integer');
        this.fast = new ExponentialMovingAverage(fastLength);
        this.slow = new ExponentialMovingAverage(slowLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume);
        let accumulationDistribution = this.accumulationDistribution;
        if (high !== null && low !== null && close !== null && volume !== null) {
            const range = high - low;
            if (range !== 0) {
                const contribution = (((close - low) - (high - close)) / range) * volume;
                const next = accumulationDistribution + contribution;
                if (Number.isFinite(contribution) && Number.isFinite(next))
                    accumulationDistribution = next;
            }
        }

        const fast = commit
            ? this.fast.push(accumulationDistribution)
            : this.fast.preview(accumulationDistribution);
        const slow = commit
            ? this.slow.push(accumulationDistribution)
            : this.slow.preview(accumulationDistribution);
        if (commit) this.accumulationDistribution = accumulationDistribution;
        const value = fast === null || slow === null ? null : finite(fast - slow);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.accumulationDistribution = 0;
        this.fast.reset();
        this.slow.reset();
    }

    protected captureState(): ChaikinOscillatorCheckpoint {
        return Object.freeze({
            accumulationDistribution: this.accumulationDistribution,
            fast: this.fast.checkpoint(),
            slow: this.slow.checkpoint(),
        });
    }

    protected restoreState(state: ChaikinOscillatorCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.accumulationDistribution) === null) {
            throw new TypeError('sschart: invalid Chaikin Oscillator checkpoint');
        }
        this.fast.restore(state.fast);
        this.slow.restore(state.slow);
        this.accumulationDistribution = state.accumulationDistribution;
    }
}

export class ChandeMomentumOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ChandeMomentumOscillatorCheckpoint
> {
    private initialized = false;
    private previousClose: number | null = null;
    private readonly up: RollingSum;
    private readonly down: RollingSum;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1)
            throw new RangeError('sschart: CMO length must be a positive integer');
        this.up = new RollingSum(length);
        this.down = new RollingSum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
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

        const delta = close === null || this.previousClose === null
            ? null
            : finite(close - this.previousClose);
        const up = delta === null ? null : Math.max(delta, 0);
        const down = delta === null ? null : Math.max(-delta, 0);
        const upSum = commit ? this.up.push(up) : this.up.preview(up);
        const downSum = commit ? this.down.push(down) : this.down.preview(down);
        if (commit) this.previousClose = close;

        let value: number | null = null;
        if (upSum !== null && downSum !== null) {
            const total = upSum + downSum;
            value = total === 0 ? 0 : finite(100 * (upSum - downSum) / total);
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.initialized = false;
        this.previousClose = null;
        this.up.reset();
        this.down.reset();
    }

    protected captureState(): ChandeMomentumOscillatorCheckpoint {
        return Object.freeze({
            initialized: this.initialized,
            previousClose: this.previousClose,
            up: this.up.checkpoint(),
            down: this.down.checkpoint(),
        });
    }

    protected restoreState(state: ChandeMomentumOscillatorCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || typeof state.initialized !== 'boolean'
            || (state.previousClose !== null && finite(state.previousClose) === null)
            || state.up?.values?.length !== state.down?.values?.length
            || (!state.initialized && (state.previousClose !== null || state.up.values.length !== 0))) {
            throw new TypeError('sschart: invalid Chande Momentum Oscillator checkpoint');
        }
        this.up.restore(state.up);
        this.down.restore(state.down);
        this.initialized = state.initialized;
        this.previousClose = state.previousClose;
    }
}

export class ConnorsRsiProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ConnorsRsiCheckpoint
> {
    private readonly closeRsi: ArrayRsiKernel;
    private readonly streakRsi: ArrayRsiKernel;
    private readonly rocRsi: ArrayRsiKernel;
    private readonly rocHistory: RingBuffer<number | null>;
    private streakPreviousPrice: number | null = null;
    private streakPrevious = 0;

    constructor(
        readonly rsiLength: number,
        readonly streakLength: number,
        readonly rocLength: number,
    ) {
        super(['rsi', 'updown', 'rocrsi', 'crsi']);
        for (const [name, value] of [
            ['RSI', rsiLength],
            ['streak RSI', streakLength],
            ['ROC RSI', rocLength],
        ] as const) {
            if (!Number.isInteger(value) || value < 1)
                throw new RangeError(`sschart: Connors ${name} length must be positive`);
        }
        this.closeRsi = new ArrayRsiKernel(rsiLength);
        this.streakRsi = new ArrayRsiKernel(streakLength);
        this.rocRsi = new ArrayRsiKernel(rocLength);
        this.rocHistory = new RingBuffer(rocLength + 1);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const rsi = commit ? this.closeRsi.push(close) : this.closeRsi.preview(close);

        let streak: number | null = null;
        if (close !== null) {
            if (this.streakPreviousPrice === null) streak = 1;
            else if (close > this.streakPreviousPrice)
                streak = this.streakPrevious > 0 ? this.streakPrevious + 1 : 1;
            else if (close < this.streakPreviousPrice)
                streak = this.streakPrevious < 0 ? this.streakPrevious - 1 : -1;
            else streak = 0;
        }
        const updown = commit
            ? this.streakRsi.push(streak)
            : this.streakRsi.preview(streak);
        if (commit && streak !== null && close !== null) {
            this.streakPreviousPrice = close;
            this.streakPrevious = streak;
        }

        let base: number | null | undefined;
        if (this.rocHistory.size === 0) base = close;
        else if (this.rocHistory.size <= this.rocLength) base = this.rocHistory.front();
        else base = this.rocHistory.at(this.rocHistory.size - this.rocLength);
        const roc = close !== null && typeof base === 'number' && base !== 0
            ? finite((close - base) / base * 100)
            : null;
        const rocrsi = commit ? this.rocRsi.push(roc) : this.rocRsi.preview(roc);
        if (commit) this.rocHistory.push(close);

        const formedAt = Math.max(this.rsiLength, this.streakLength, this.rocLength);
        const formed = input.index >= formedAt
            && rsi !== null && updown !== null && rocrsi !== null;
        const crsi = formed ? finite((rsi + updown + rocrsi) / 3) : null;
        return {
            isFormed: crsi !== null,
            values: [
                this.output('rsi', formed ? rsi : null, input.index),
                this.output('updown', formed ? updown : null, input.index),
                this.output('rocrsi', formed ? rocrsi : null, input.index),
                this.output('crsi', crsi, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.closeRsi.reset();
        this.streakRsi.reset();
        this.rocRsi.reset();
        this.rocHistory.clear();
        this.streakPreviousPrice = null;
        this.streakPrevious = 0;
    }

    protected captureState(): ConnorsRsiCheckpoint {
        return Object.freeze({
            closeRsi: this.closeRsi.checkpoint(),
            streakRsi: this.streakRsi.checkpoint(),
            rocRsi: this.rocRsi.checkpoint(),
            rocHistory: this.rocHistory.checkpoint(),
            streakPreviousPrice: this.streakPreviousPrice,
            streakPrevious: this.streakPrevious,
        });
    }

    protected restoreState(state: ConnorsRsiCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || (state.streakPreviousPrice !== null && finite(state.streakPreviousPrice) === null)
            || finite(state.streakPrevious) === null) {
            throw new TypeError('sschart: invalid Connors RSI checkpoint');
        }
        this.closeRsi.restore(state.closeRsi);
        this.streakRsi.restore(state.streakRsi);
        this.rocRsi.restore(state.rocRsi);
        this.rocHistory.restore(state.rocHistory);
        this.streakPreviousPrice = state.streakPreviousPrice;
        this.streakPrevious = state.streakPrevious;
    }
}

export class EaseOfMovementProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    EaseOfMovementCheckpoint
> {
    private previousHigh = 0;
    private previousLow = 0;
    private readonly values: RollingSum;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1)
            throw new RangeError('sschart: EOM length must be a positive integer');
        this.values = new RollingSum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const volume = finite(input.value?.volume);
        const valid = high !== null && low !== null && volume !== null;
        const range = valid ? high - low : 0;
        const canCalculate = valid && this.previousHigh !== 0 && this.previousLow !== 0
            && range !== 0 && volume !== 0;
        let average: number | null = null;
        if (canCalculate) {
            const midpointMove = (high + low) / 2
                - (this.previousHigh + this.previousLow) / 2;
            const emv = finite(midpointMove * range / volume);
            if (emv !== null) {
                const sum = commit ? this.values.push(emv) : this.values.preview(emv);
                average = sum === null ? null : finite(sum / this.length);
            }
        }

        if (commit && average === null && valid) {
            this.previousHigh = high;
            this.previousLow = low;
        }
        return {
            isFormed: average !== null,
            values: [this.output('line', average, input.index)],
        };
    }

    protected resetState(): void {
        this.previousHigh = 0;
        this.previousLow = 0;
        this.values.reset();
    }

    protected captureState(): EaseOfMovementCheckpoint {
        return Object.freeze({
            previousHigh: this.previousHigh,
            previousLow: this.previousLow,
            values: this.values.checkpoint(),
        });
    }

    protected restoreState(state: EaseOfMovementCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.previousHigh) === null || finite(state.previousLow) === null) {
            throw new TypeError('sschart: invalid Ease Of Movement checkpoint');
        }
        this.values.restore(state.values);
        this.previousHigh = state.previousHigh;
        this.previousLow = state.previousLow;
    }
}

export class ApprovalFlowIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ApprovalFlowIndexCheckpoint
> {
    private previousClose = 0;
    private totalUp = 0;
    private totalDown = 0;
    private count = 0;
    private formed = false;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1)
            throw new RangeError('sschart: AFI length must be a positive integer');
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        if (close === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }
        if (this.previousClose === 0) {
            if (commit) this.previousClose = close;
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const volume = finite(input.value?.volume) ?? 0;
        const count = this.formed ? this.count : this.count + 1;
        const formed = this.formed || count === this.length;
        const totalUp = this.totalUp + (close > this.previousClose ? volume : 0);
        const totalDown = this.totalDown + (close < this.previousClose ? volume : 0);
        const total = totalUp + totalDown;
        const value = formed && total !== 0
            ? finite(100 * (totalUp - totalDown) / total)
            : null;

        if (commit) {
            this.count = count;
            this.formed = formed;
            this.totalUp = totalUp;
            this.totalDown = totalDown;
            if (!formed) this.previousClose = close;
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.previousClose = 0;
        this.totalUp = 0;
        this.totalDown = 0;
        this.count = 0;
        this.formed = false;
    }

    protected captureState(): ApprovalFlowIndexCheckpoint {
        return Object.freeze({
            previousClose: this.previousClose,
            totalUp: this.totalUp,
            totalDown: this.totalDown,
            count: this.count,
            formed: this.formed,
        });
    }

    protected restoreState(state: ApprovalFlowIndexCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.previousClose) === null
            || finite(state.totalUp) === null || finite(state.totalDown) === null
            || !Number.isInteger(state.count) || state.count < 0 || state.count > this.length
            || typeof state.formed !== 'boolean'
            || state.formed !== (state.count === this.length)) {
            throw new TypeError('sschart: invalid Approval Flow Index checkpoint');
        }
        this.previousClose = state.previousClose;
        this.totalUp = state.totalUp;
        this.totalDown = state.totalDown;
        this.count = state.count;
        this.formed = state.formed;
    }
}

export class ForceIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ForceIndexCheckpoint
> {
    private initialized = false;
    private previousClose: number | null = null;
    private readonly average: ExponentialMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500)
            throw new RangeError('sschart: Force Index length must be an integer from 1 to 500');
        this.average = new ExponentialMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
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

        const volume = finite(input.value?.volume);
        const force = close === null || this.previousClose === null || volume === null
            ? null
            : finite((close - this.previousClose) * volume);
        const value = force === null
            ? null
            : (commit ? this.average.push(force) : this.average.preview(force));
        if (commit) this.previousClose = close;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.initialized = false;
        this.previousClose = null;
        this.average.reset();
    }

    protected captureState(): ForceIndexCheckpoint {
        return Object.freeze({
            initialized: this.initialized,
            previousClose: this.previousClose,
            average: this.average.checkpoint(),
        });
    }

    protected restoreState(state: ForceIndexCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || typeof state.initialized !== 'boolean'
            || (state.previousClose !== null && finite(state.previousClose) === null)
            || (!state.initialized && state.previousClose !== null)) {
            throw new TypeError('sschart: invalid Force Index checkpoint');
        }
        this.average.restore(state.average);
        this.initialized = state.initialized;
        this.previousClose = state.previousClose;
    }
}

export class ForecastOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingLinearRegressionCheckpoint
> {
    private readonly regression: RollingLinearRegression;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Forecast Oscillator length must be an integer from 1 to 500',
            );
        }
        this.regression = new RollingLinearRegression(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const price = finite(input.value?.close);
        const forecast = commit
            ? this.regression.push(price)
            : this.regression.preview(price);
        const candidate = this.length > 1 && price !== null && price !== 0
            && forecast !== null
            ? ((price - forecast) / price) * 100
            : null;
        const value = finite(candidate);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.regression.reset(); }
    protected captureState(): RollingLinearRegressionCheckpoint {
        return this.regression.checkpoint();
    }
    protected restoreState(state: RollingLinearRegressionCheckpoint): void {
        this.regression.restore(state);
    }
}

export class FiniteVolumeElementProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly average: SimpleMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Finite Volume Element length must be an integer from 1 to 500',
            );
        }
        this.average = new SimpleMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume);
        const range = high === null || low === null ? null : high - low;
        let raw = 0;
        if (range !== null && range !== 0 && close !== null
            && volume !== null && volume !== 0) {
            const volumeForce = volume * (2 * ((close - low!) / range) - 1);
            raw = volumeForce / volume;
        }
        const average = commit ? this.average.push(raw) : this.average.preview(raw);
        const value = average === null ? null : finite(average * 100);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void { this.average.restore(state); }
}

export class HighLowIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    HighLowIndexCheckpoint
> {
    private readonly high: RollingMaximum;
    private readonly low: RollingMinimum;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: High Low Index length must be an integer from 1 to 500',
            );
        }
        this.high = new RollingMaximum(length);
        this.low = new RollingMinimum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const currentHigh = finite(input.value?.high);
        const currentLow = finite(input.value?.low);
        const maximum = commit
            ? this.high.push(currentHigh)
            : this.high.preview(currentHigh);
        const minimum = commit
            ? this.low.push(currentLow)
            : this.low.preview(currentLow);
        let value: number | null = null;
        if (maximum !== null && minimum !== null && currentHigh !== null) {
            const range = maximum - minimum;
            value = range === 0 ? 50 : finite((currentHigh - minimum) / range * 100);
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.high.reset();
        this.low.reset();
    }

    protected captureState(): HighLowIndexCheckpoint {
        return Object.freeze({
            high: this.high.checkpoint(),
            low: this.low.checkpoint(),
        });
    }

    protected restoreState(state: HighLowIndexCheckpoint): void {
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
            throw new TypeError('sschart: invalid High Low Index checkpoint');
        }
        this.high.restore(state.high);
        this.low.restore(state.low);
    }
}

export class IntradayIntensityIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly average: SimpleMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Intraday Intensity Index length must be an integer from 1 to 500',
            );
        }
        this.average = new SimpleMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume) ?? 0;
        let raw: number | null = null;
        if (high !== null && low !== null && close !== null) {
            const denominator = (high - low) * volume;
            raw = denominator === 0
                ? 0
                : finite(2 * ((close - low) - (high - close)) / denominator);
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

export class IntradayMomentumIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    IntradayMomentumIndexCheckpoint
> {
    private readonly up: RollingSum;
    private readonly down: RollingSum;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Intraday Momentum Index length must be an integer from 1 to 500',
            );
        }
        this.up = new RollingSum(length);
        this.down = new RollingSum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const open = finite(input.value?.open);
        const close = finite(input.value?.close);
        const difference = open === null || close === null ? null : finite(close - open);
        const up = difference === null ? null : Math.max(difference, 0);
        const down = difference === null ? null : Math.max(-difference, 0);
        const upSum = commit ? this.up.push(up) : this.up.preview(up);
        const downSum = commit ? this.down.push(down) : this.down.preview(down);
        let value: number | null = null;
        if (upSum !== null && downSum !== null) {
            const total = upSum + downSum;
            value = total === 0 ? 0 : finite(100 * upSum / total);
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.up.reset();
        this.down.reset();
    }

    protected captureState(): IntradayMomentumIndexCheckpoint {
        return Object.freeze({
            up: this.up.checkpoint(),
            down: this.down.checkpoint(),
        });
    }

    protected restoreState(state: IntradayMomentumIndexCheckpoint): void {
        const valid = (checkpoint: RollingWindowCheckpoint) => (
            checkpoint !== null
            && typeof checkpoint === 'object'
            && Array.isArray(checkpoint.values)
            && checkpoint.values.length <= this.length
            && checkpoint.values.every((value) => value === null || finite(value) !== null)
        );
        if (state === null || typeof state !== 'object'
            || !valid(state.up) || !valid(state.down)
            || state.up.values.length !== state.down.values.length) {
            throw new TypeError('sschart: invalid Intraday Momentum Index checkpoint');
        }
        this.up.restore(state.up);
        this.down.restore(state.down);
    }
}

/** Stateless candle-volume pass-through with a painter direction hint. */
export class VolumeIndicatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    null
> {
    constructor() { super(['value']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        _commit: boolean,
    ): IndicatorCalculationResult {
        const volume = finite(input.value?.volume);
        const open = finite(input.value?.open);
        const close = finite(input.value?.close);
        const up = open !== null && close !== null ? close >= open : true;
        return {
            isFormed: volume !== null,
            values: [this.output('value', volume, input.index, { up })],
        };
    }

    protected resetState(): void {}
    protected captureState(): null { return null; }
    protected restoreState(state: null): void {
        if (state !== null) throw new TypeError('sschart: invalid Volume checkpoint');
    }
}

export class MarketFacilitationIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    null
> {
    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        _commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const volume = finite(input.value?.volume);
        const value = high === null || low === null || volume === null || volume === 0
            ? null
            : finite((high - low) / volume);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { /* stateless */ }
    protected captureState(): null { return null; }
    protected restoreState(state: null): void {
        if (state !== null)
            throw new TypeError('sschart: invalid Market Facilitation Index checkpoint');
    }
}

export class NegativeVolumeIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    NegativeVolumeIndexCheckpoint
> {
    private previousClose = 0;
    private previousVolume = 0;
    private current = 1_000;

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume);
        let value = this.current;
        if (close !== null && volume !== null) {
            if (this.previousClose !== 0 && this.previousVolume !== 0 && volume !== 0
                && volume < this.previousVolume) {
                value = finite(
                    this.current + this.current * (close - this.previousClose) / this.previousClose,
                ) ?? this.current;
            }
            if (commit) {
                this.previousClose = close;
                this.previousVolume = volume;
                this.current = value;
            }
        }
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.previousClose = 0;
        this.previousVolume = 0;
        this.current = 1_000;
    }

    protected captureState(): NegativeVolumeIndexCheckpoint {
        return Object.freeze({
            previousClose: this.previousClose,
            previousVolume: this.previousVolume,
            value: this.current,
        });
    }

    protected restoreState(state: NegativeVolumeIndexCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.previousClose) === null
            || finite(state.previousVolume) === null
            || finite(state.value) === null) {
            throw new TypeError('sschart: invalid Negative Volume Index checkpoint');
        }
        this.previousClose = state.previousClose;
        this.previousVolume = state.previousVolume;
        this.current = state.value;
    }
}

export class PositiveVolumeIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    PositiveVolumeIndexCheckpoint
> {
    private previousClose = 0;
    private previousVolume = 0;
    private current = 1_000;

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume);
        let value = this.current;
        if (close !== null && volume !== null) {
            if (this.previousClose !== 0 && this.previousVolume !== 0 && volume > 0
                && volume > this.previousVolume) {
                value = finite(
                    this.current + this.current * (close - this.previousClose) / this.previousClose,
                ) ?? this.current;
            }
            if (commit) {
                this.previousClose = close;
                this.previousVolume = volume;
                this.current = value;
            }
        }
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.previousClose = 0;
        this.previousVolume = 0;
        this.current = 1_000;
    }

    protected captureState(): PositiveVolumeIndexCheckpoint {
        return Object.freeze({
            previousClose: this.previousClose,
            previousVolume: this.previousVolume,
            value: this.current,
        });
    }

    protected restoreState(state: PositiveVolumeIndexCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.previousClose) === null
            || finite(state.previousVolume) === null
            || finite(state.value) === null) {
            throw new TypeError('sschart: invalid Positive Volume Index checkpoint');
        }
        this.previousClose = state.previousClose;
        this.previousVolume = state.previousVolume;
        this.current = state.value;
    }
}

export class PsychologicalLineProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    PsychologicalLineCheckpoint
> {
    private readonly closes: RingBuffer<number>;
    private upCount = 0;

    constructor(readonly length: number) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        this.closes = new RingBuffer(length);
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

        let upCount = this.upCount;
        const latest = this.closes.back();
        if (this.closes.full && this.closes.front()! < latest!) upCount -= 1;
        if (latest !== undefined && price > latest) upCount += 1;
        const formed = this.closes.full || this.closes.size + 1 === this.length;
        if (commit) {
            this.closes.push(price);
            this.upCount = upCount;
        }
        const value = formed ? upCount / this.length : null;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.closes.clear();
        this.upCount = 0;
    }

    protected captureState(): PsychologicalLineCheckpoint {
        return Object.freeze({
            closes: this.closes.checkpoint(),
            upCount: this.upCount,
        });
    }

    protected restoreState(state: PsychologicalLineCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Number.isInteger(state.upCount)
            || !Array.isArray(state.closes?.values)
            || state.closes.values.length > this.length
            || state.closes.values.some((value) => finite(value) === null)) {
            throw new TypeError('sschart: invalid Psychological Line checkpoint');
        }
        this.closes.restore(state.closes);
        this.upCount = state.upCount;
    }
}

export class PriceVolumeTrendProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    PriceVolumeTrendCheckpoint
> {
    private previousClose = 0;
    private current = 0;

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume);
        if (close === null || volume === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        if (this.previousClose === 0) {
            if (commit) this.previousClose = close;
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const value = finite(
            this.current + volume * (close - this.previousClose) / this.previousClose,
        );
        if (commit) {
            this.previousClose = close;
            if (value !== null) this.current = value;
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.previousClose = 0;
        this.current = 0;
    }

    protected captureState(): PriceVolumeTrendCheckpoint {
        return Object.freeze({
            previousClose: this.previousClose,
            value: this.current,
        });
    }

    protected restoreState(state: PriceVolumeTrendCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.previousClose) === null || finite(state.value) === null) {
            throw new TypeError('sschart: invalid Price Volume Trend checkpoint');
        }
        this.previousClose = state.previousClose;
        this.current = state.value;
    }
}

export interface OnBalanceVolumeCheckpoint {
    readonly previousClose: number;
    readonly cumulative: number;
}

class OnBalanceVolumeKernel {
    private previousClose = 0;
    private cumulative = 0;

    process(candle: Readonly<IndicatorCandle>, commit: boolean): number | null {
        const close = finite(candle?.close);
        const volume = finite(candle?.volume);
        if (close === null || volume === null) return null;

        let value = this.cumulative;
        if (this.previousClose !== 0) {
            if (close > this.previousClose) value += volume;
            else if (close < this.previousClose) value -= volume;
        }
        if (commit) {
            this.previousClose = close;
            this.cumulative = value;
        }
        return value;
    }

    reset(): void {
        this.previousClose = 0;
        this.cumulative = 0;
    }

    checkpoint(): OnBalanceVolumeCheckpoint {
        return Object.freeze({
            previousClose: this.previousClose,
            cumulative: this.cumulative,
        });
    }

    restore(state: OnBalanceVolumeCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.previousClose) === null || finite(state.cumulative) === null) {
            throw new TypeError('sschart: invalid OBV checkpoint');
        }
        this.previousClose = state.previousClose;
        this.cumulative = state.cumulative;
    }
}

export class OnBalanceVolumeProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    OnBalanceVolumeCheckpoint
> {
    private readonly kernel = new OnBalanceVolumeKernel();

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = this.kernel.process(input.value, commit);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.kernel.reset();
    }
    protected captureState(): OnBalanceVolumeCheckpoint {
        return this.kernel.checkpoint();
    }
    protected restoreState(state: OnBalanceVolumeCheckpoint): void {
        this.kernel.restore(state);
    }
}

export interface OnBalanceVolumeMeanCheckpoint {
    readonly obv: OnBalanceVolumeCheckpoint;
    readonly average: RollingWindowCheckpoint;
}

export class OnBalanceVolumeMeanProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    OnBalanceVolumeMeanCheckpoint
> {
    private readonly obv = new OnBalanceVolumeKernel();
    private readonly average: SimpleMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        resolvedPeriod(length, length, 'length');
        this.average = new SimpleMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const obv = this.obv.process(input.value, commit);
        const value = commit ? this.average.push(obv) : this.average.preview(obv);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.obv.reset();
        this.average.reset();
    }

    protected captureState(): OnBalanceVolumeMeanCheckpoint {
        return Object.freeze({
            obv: this.obv.checkpoint(),
            average: this.average.checkpoint(),
        });
    }

    protected restoreState(state: OnBalanceVolumeMeanCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid On-Balance Volume Mean checkpoint');
        this.obv.restore(state.obv);
        this.average.restore(state.average);
    }
}

export interface BalanceVolumeCheckpoint {
    readonly seeded: boolean;
    readonly previousClose: number;
    readonly cumulative: number;
}

export class BalanceVolumeProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    BalanceVolumeCheckpoint
> {
    private seeded = false;
    private previousClose = 0;
    private cumulative = 0;

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume);
        if (!this.seeded) {
            if (commit && close !== null) {
                this.seeded = true;
                this.previousClose = close;
            }
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        let value: number | null = null;
        if (close !== null && volume !== null) {
            value = this.cumulative;
            if (close > this.previousClose) value += volume;
            else if (close < this.previousClose) value -= volume;
            if (commit) {
                this.previousClose = close;
                this.cumulative = value;
            }
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.seeded = false;
        this.previousClose = 0;
        this.cumulative = 0;
    }
    protected captureState(): BalanceVolumeCheckpoint {
        return Object.freeze({
            seeded: this.seeded,
            previousClose: this.previousClose,
            cumulative: this.cumulative,
        });
    }
    protected restoreState(state: BalanceVolumeCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || typeof state.seeded !== 'boolean'
            || finite(state.previousClose) === null || finite(state.cumulative) === null) {
            throw new TypeError('sschart: invalid balance volume checkpoint');
        }
        this.seeded = state.seeded;
        this.previousClose = state.previousClose;
        this.cumulative = state.cumulative;
    }
}

export const RelativeStrengthIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'RelativeStrengthIndex',
    name: 'RSI',
    description: 'Wilder relative strength oscillator of average gains and losses.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14, 2)],
    outputs: [{
        id: 'oscillator',
        name: 'RSI',
        defaultStyle: lineStyle('#42a5f5'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new RelativeStrengthIndexProcessor(
        resolvedLength(parameters, 14, 2),
    ),
});

export const DynamicZonesRsiIndicator: IndicatorDefinition<
    IndicatorCandle,
    DynamicZonesRsiParameters
> = registerIndicator({
    id: 'DynamicZonesRSI',
    name: 'Dynamic Zones RSI',
    description: 'RSI remapped between percentile zones of its own recent range.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        lengthParameter(14),
        {
            id: 'oversoldLevel', name: 'Oversold Level',
            type: IndicatorParameterType.Number, defaultValue: 20,
            min: 0, max: 100, step: 1,
        },
        {
            id: 'overboughtLevel', name: 'Overbought Level',
            type: IndicatorParameterType.Number, defaultValue: 80,
            min: 0, max: 100, step: 1,
        },
    ],
    outputs: [{ id: 'line', name: 'Dynamic Zones RSI', defaultStyle: lineStyle('#7e57c2') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new DynamicZonesRsiProcessor(
        resolvedLength(parameters, 14),
        resolvedFinite(parameters?.oversoldLevel, 20, 'oversoldLevel'),
        resolvedFinite(parameters?.overboughtLevel, 80, 'overboughtLevel'),
    ),
});

export const DeMarkerIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'DeMarker',
    name: 'De Marker',
    description: 'Ratio of recent upward high movement to combined high and low movement.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{ id: 'line', name: 'De Marker', defaultStyle: lineStyle('#42a5f5') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new DeMarkerProcessor(resolvedLength(parameters, 14)),
});

export const DemandIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'DemandIndex',
    name: 'Demand Index',
    description: 'Price-and-volume demand pressure smoothed over recent valid movements.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{ id: 'line', name: 'Demand Index', defaultStyle: lineStyle('#ab47bc') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new DemandIndexProcessor(resolvedLength(parameters, 14)),
});

export const DisparityIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'DisparityIndex',
    name: 'Disparity Index',
    description: 'Percentage distance between the current close and its simple moving average.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{ id: 'line', name: 'Disparity Index', defaultStyle: lineStyle('#26c6da') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new DisparityIndexProcessor(
        resolvedLength(parameters, 14),
    ),
});

export const MomentumIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'Momentum',
    name: 'Momentum',
    description: 'Difference between the current close and the close N valid samples ago.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(5)],
    outputs: [{ id: 'line', name: 'Momentum', defaultStyle: lineStyle('#ffb74d') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: (parameters) => new MomentumProcessor(resolvedLength(parameters, 5)),
});

export const QStickIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'QStick',
    name: 'Q Stick',
    description: 'Simple moving average of the candle open-minus-close difference.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(15)],
    outputs: [{ id: 'line', name: 'Q Stick', defaultStyle: lineStyle('#ec407a') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new QStickProcessor(resolvedLength(parameters, 15)),
});

export const RateOfChangeIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'RateOfChange',
    name: 'Rate of Change',
    description: 'Percentage change from the close N bars ago.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(12)],
    outputs: [{ id: 'line', name: 'ROC', defaultStyle: lineStyle('#26c6da') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new RateOfChangeProcessor(resolvedLength(parameters, 12)),
});

export const WilliamsRIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'WilliamsR',
    name: 'Williams R',
    description: 'Close position within the recent high-low range, scaled from -100 to 0.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{ id: 'line', name: 'Williams R', defaultStyle: lineStyle('#7e57c2') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new WilliamsRProcessor(resolvedLength(parameters, 14)),
});

export const StochasticKIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'StochasticK',
    name: 'Stochastic K',
    description: 'Close position within the trailing high-low range as raw stochastic %K.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{ id: 'line', name: '%K', defaultStyle: lineStyle('#42a5f5') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new StochasticKProcessor(
        resolvedLength(parameters, 14),
    ),
});

export const MoneyFlowIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'MoneyFlowIndex',
    name: 'Money Flow Index',
    description: 'Volume-weighted momentum oscillator of positive and negative money flow.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{ id: 'line', name: 'MFI', defaultStyle: lineStyle('#66bb6a') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new MoneyFlowIndexProcessor(
        resolvedLength(parameters, 14),
    ),
});

export const MomentumOfMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumOfMovingAverageParameters
> = registerIndicator({
    id: 'MomentumOfMovingAverage',
    name: 'Momentum Of Moving Average',
    description: 'StockSharp-compatible momentum of its shared moving-average buffer.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        lengthParameter(14),
        {
            id: 'momentumPeriod',
            name: 'Momentum Period',
            description: 'Compatibility setting retained by StockSharp; it does not alter the formula.',
            type: IndicatorParameterType.Integer,
            defaultValue: 10,
            min: 1,
            max: 500,
            step: 1,
        },
    ],
    outputs: [{
        id: 'line', name: 'Momentum Of Moving Average',
        defaultStyle: lineStyle('#42a5f5'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new MomentumOfMovingAverageProcessor(
        resolvedPeriod(parameters?.length, 14, 'length'),
        resolvedPeriod(parameters?.momentumPeriod, 10, 'momentumPeriod'),
    ),
});

export const OscillatorOfMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    OscillatorOfMovingAverageParameters
> = registerIndicator({
    id: 'OscillatorOfMovingAverage',
    name: 'Oscillator Of Moving Average',
    description: 'Percentage divergence between short and long simple moving averages.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortPeriod', name: 'Short Period', type: IndicatorParameterType.Integer,
            defaultValue: 10, min: 1, max: 500, step: 1,
        },
        {
            id: 'longPeriod', name: 'Long Period', type: IndicatorParameterType.Integer,
            defaultValue: 30, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'line', name: 'Oscillator Of Moving Average',
        defaultStyle: lineStyle('#42a5f5'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new OscillatorOfMovingAverageProcessor(
        resolvedPeriod(parameters?.shortPeriod, 10, 'shortPeriod'),
        resolvedPeriod(parameters?.longPeriod, 30, 'longPeriod'),
    ),
});

export const PrettyGoodOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'PrettyGoodOscillator',
    name: 'Pretty Good Oscillator',
    description: 'Close displacement from its average normalized by the rolling candle range.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{
        id: 'line', name: 'PGO',
        defaultStyle: lineStyle('#7e57c2'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new PrettyGoodOscillatorProcessor(
        resolvedPeriod(parameters?.length, 14, 'length'),
    ),
});

export const RelativeMomentumIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    RelativeMomentumIndexParameters
> = registerIndicator({
    id: 'RelativeMomentumIndex',
    name: 'Relative Momentum Index',
    description: 'RSI-style balance of gains and losses measured over a configurable price lag.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        lengthParameter(14),
        {
            id: 'momentumPeriod', name: 'Momentum Period',
            type: IndicatorParameterType.Integer,
            defaultValue: 3, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{ id: 'line', name: 'RMI', defaultStyle: lineStyle('#42a5f5') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new RelativeMomentumIndexProcessor(
        resolvedPeriod(parameters?.length, 14, 'length'),
        resolvedPeriod(parameters?.momentumPeriod, 3, 'momentumPeriod'),
    ),
});

export const RangeActionVerificationIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    RangeActionVerificationIndexParameters
> = registerIndicator({
    id: 'RangeActionVerificationIndex',
    name: 'Range Action Verification Index',
    description: 'Absolute percentage divergence between short and long simple averages.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortLength', name: 'Short Length', type: IndicatorParameterType.Integer,
            defaultValue: 7, min: 1, max: 500, step: 1,
        },
        {
            id: 'longLength', name: 'Long Length', type: IndicatorParameterType.Integer,
            defaultValue: 65, min: 1, max: 650, step: 1,
        },
    ],
    outputs: [{ id: 'line', name: 'RAVI', defaultStyle: lineStyle('#26a69a') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new RangeActionVerificationIndexProcessor(
        resolvedPeriod(parameters?.shortLength, 7, 'shortLength'),
        resolvedPeriod(parameters?.longLength, 65, 'longLength', 650),
    ),
});

export const RankCorrelationIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'RankCorrelationIndex',
    name: 'Rank Correlation Index',
    description: 'Spearman correlation between close-price rank and time rank.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14, 2)],
    outputs: [{ id: 'line', name: 'RCI', defaultStyle: lineStyle('#7e57c2') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new RankCorrelationIndexProcessor(
        resolvedPeriod(parameters?.length, 14, 'length'),
    ),
});

export const MomentumPinballIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'MomentumPinball',
    name: 'Momentum Pinball',
    description: 'Close displacement from the oldest price, normalized by the rolling range.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{
        id: 'line', name: 'Momentum Pinball',
        defaultStyle: lineStyle('#ff7043'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new MomentumPinballProcessor(
        resolvedPeriod(parameters?.length, 14, 'length'),
    ),
});

export const ChaikinMoneyFlowIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'ChaikinMoneyFlow',
    name: 'Chaikin Money Flow',
    description: 'Rolling volume-weighted close position within each candle range.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(20)],
    outputs: [{ id: 'line', name: 'CMF', defaultStyle: lineStyle('#26a69a') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new ChaikinMoneyFlowProcessor(
        resolvedLength(parameters, 20),
    ),
});

export const ChaikinOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    ChaikinOscillatorParameters
> = registerIndicator({
    id: 'ChaikinOscillator',
    name: 'Chaikin Oscillator',
    description: 'Difference between fast and slow exponential averages of ADL.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'fast', name: 'Fast Length', type: IndicatorParameterType.Integer,
            defaultValue: 3, min: 1, max: 500, step: 1,
        },
        {
            id: 'slow', name: 'Slow Length', type: IndicatorParameterType.Integer,
            defaultValue: 10, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{ id: 'line', name: 'Chaikin Oscillator', defaultStyle: lineStyle('#ffb74d') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Volume,
    processorFactory: (parameters) => new ChaikinOscillatorProcessor(
        resolvedPeriod(parameters?.fast, 3, 'fast'),
        resolvedPeriod(parameters?.slow, 10, 'slow'),
    ),
});

export const ChandeMomentumOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'ChandeMomentumOscillator',
    name: 'Chande Momentum Oscillator',
    description: 'Signed balance of rolling upward and downward close changes.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(15)],
    outputs: [{ id: 'line', name: 'CMO', defaultStyle: lineStyle('#7e57c2') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new ChandeMomentumOscillatorProcessor(
        resolvedLength(parameters, 15),
    ),
});

export const ConnorsRsiIndicator: IndicatorDefinition<
    IndicatorCandle,
    ConnorsRsiParameters
> = registerIndicator({
    id: 'ConnorsRSI',
    name: 'Connors RSI',
    description: 'Composite of close RSI, streak RSI and RSI of long-period ROC.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'rsiLength', name: 'RSI Length', type: IndicatorParameterType.Integer,
            defaultValue: 3, min: 1, max: 500, step: 1,
        },
        {
            id: 'streakLength', name: 'Streak RSI Length', type: IndicatorParameterType.Integer,
            defaultValue: 2, min: 1, max: 500, step: 1,
        },
        {
            id: 'rocLength', name: 'ROC RSI Length', type: IndicatorParameterType.Integer,
            defaultValue: 100, min: 1, max: 1_000, step: 1,
        },
    ],
    outputs: [
        { id: 'rsi', name: 'RSI', defaultStyle: lineStyle('#42a5f5') },
        { id: 'updown', name: 'Up/Down RSI', defaultStyle: lineStyle('#ffb74d') },
        { id: 'rocrsi', name: 'ROC RSI', defaultStyle: lineStyle('#ab47bc') },
        { id: 'crsi', name: 'Connors RSI', defaultStyle: lineStyle('#26a69a') },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new ConnorsRsiProcessor(
        resolvedPeriod(parameters?.rsiLength, 3, 'rsiLength'),
        resolvedPeriod(parameters?.streakLength, 2, 'streakLength'),
        resolvedPeriod(parameters?.rocLength, 100, 'rocLength', 1_000),
    ),
});

export const EaseOfMovementIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'EaseOfMovement',
    name: 'Ease Of Movement',
    description: 'Smoothed midpoint movement scaled by candle range and volume.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{ id: 'line', name: 'EOM', defaultStyle: lineStyle('#26a69a') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new EaseOfMovementProcessor(
        resolvedLength(parameters, 14),
    ),
});

export const ApprovalFlowIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'ApprovalFlowIndex',
    name: 'Approval Flow Index',
    description: 'Cumulative balance of volume on approved upward and downward moves.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{ id: 'line', name: 'AFI', defaultStyle: lineStyle('#42a5f5') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new ApprovalFlowIndexProcessor(
        resolvedLength(parameters, 14),
    ),
});

export const ForceIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'ForceIndex',
    name: 'Force Index',
    description: 'Exponential average of close-to-close change multiplied by volume.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(13)],
    outputs: [{ id: 'line', name: 'Force Index', defaultStyle: lineStyle('#7e57c2') }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Volume,
    processorFactory: (parameters) => new ForceIndexProcessor(
        resolvedLength(parameters, 13),
    ),
});

export const ForecastOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'ForecastOscillator',
    name: 'Forecast Oscillator',
    description: 'Percent distance between close and its rolling regression endpoint.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{ id: 'line', name: 'Forecast Oscillator', defaultStyle: lineStyle('#42a5f5') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new ForecastOscillatorProcessor(
        resolvedLength(parameters, 14),
    ),
});

export const FiniteVolumeElementIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'FiniteVolumeElement',
    name: 'Finite Volume Element',
    description: 'Average close position within the candle range, gated by volume.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(22)],
    outputs: [{ id: 'line', name: 'Finite Volume Element', defaultStyle: lineStyle('#26a69a') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new FiniteVolumeElementProcessor(
        resolvedLength(parameters, 22),
    ),
});

export const HighLowIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'HighLowIndex',
    name: 'High Low Index',
    description: 'Current high position within the trailing high-low range.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{ id: 'line', name: 'High Low Index', defaultStyle: lineStyle('#26c6da') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new HighLowIndexProcessor(
        resolvedLength(parameters, 14),
    ),
});

export const IntradayIntensityIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'IntradayIntensityIndex',
    name: 'Intraday Intensity Index',
    description: 'Average close placement within the range normalized by volume.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{ id: 'line', name: 'Intraday Intensity Index', defaultStyle: lineStyle('#42a5f5') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new IntradayIntensityIndexProcessor(
        resolvedLength(parameters, 14),
    ),
});

export const IntradayMomentumIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'IntradayMomentumIndex',
    name: 'Intraday Momentum Index',
    description: 'RSI-style balance of intraday gains and losses measured from open to close.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{ id: 'line', name: 'Intraday Momentum Index', defaultStyle: lineStyle('#7e57c2') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new IntradayMomentumIndexProcessor(
        resolvedLength(parameters, 14),
    ),
});

export const VolumeWeightedMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'VolumeWeightedMovingAverage',
    name: 'Volume Weighted Moving Average',
    description: 'Rolling closing-price average weighted by traded volume.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(32)],
    outputs: [{ id: 'line', name: 'VWMA', defaultStyle: lineStyle('#26a69a') }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new VolumeWeightedMovingAverageProcessor(
        resolvedLength(parameters, 32),
    ),
});

export const PercentageVolumeOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    PercentageVolumeOscillatorParameters
> = registerIndicator({
    id: 'PercentageVolumeOscillator',
    name: 'Percentage Volume Oscillator',
    description: 'Percentage difference between short and long exponential volume averages.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortPeriod', name: 'Short Period', type: IndicatorParameterType.Integer,
            defaultValue: 12, min: 1, max: 500, step: 1,
        },
        {
            id: 'longPeriod', name: 'Long Period', type: IndicatorParameterType.Integer,
            defaultValue: 26, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [
        {
            id: 'shortEma', name: 'Short EMA',
            defaultStyle: lineStyle('#42a5f5'),
        },
        {
            id: 'longEma', name: 'Long EMA',
            defaultStyle: lineStyle('#ffca28'),
        },
        {
            id: 'pvo', name: 'PVO',
            defaultStyle: lineStyle('#ab47bc'),
        },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Volume,
    processorFactory: (parameters) => new PercentageVolumeOscillatorProcessor(
        resolvedPeriod(parameters?.shortPeriod, 12, 'shortPeriod'),
        resolvedPeriod(parameters?.longPeriod, 26, 'longPeriod'),
    ),
});

export const TwiggsMoneyFlowIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'TwiggsMoneyFlow',
    name: 'Twiggs Money Flow',
    description: 'Ratio of exponential averages of Twiggs accumulation and traded volume.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(21)],
    outputs: [{ id: 'line', name: 'TMF', defaultStyle: lineStyle('#26a69a') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new TwiggsMoneyFlowProcessor(
        resolvedLength(parameters, 21),
    ),
});

export const UltimateOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'UltimateOscillator',
    name: 'Ultimate Oscillator',
    description: 'Weighted buying-pressure oscillator over fixed 7, 14 and 28 bar windows.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'Ultimate Oscillator', defaultStyle: lineStyle('#42a5f5') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: () => new UltimateOscillatorProcessor(),
});

export const VolumeIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'VolumeIndicator',
    name: 'Volume',
    description: 'Per-candle traded volume colored by the candle direction.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{
        id: 'value',
        name: 'Volume',
        defaultStyle: {
            series: IndicatorSeriesStyle.Histogram,
            color: '#4a9eff',
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Volume,
    processorFactory: () => new VolumeIndicatorProcessor(),
});

export const MarketFacilitationIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'MarketFacilitationIndex',
    name: 'Market Facilitation Index',
    description: 'Candle high-low range per unit of traded volume.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{
        id: 'line',
        name: 'Market Facilitation Index',
        defaultStyle: lineStyle('#66bb6a'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: () => new MarketFacilitationIndexProcessor(),
});

export const NegativeVolumeIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'NegativeVolumeIndex',
    name: 'Negative Volume Index',
    description: 'Cumulative price index updated only when volume declines.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{
        id: 'line', name: 'NVI',
        defaultStyle: lineStyle('#26a69a'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: () => new NegativeVolumeIndexProcessor(),
});

export const PositiveVolumeIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'PositiveVolumeIndex',
    name: 'Positive Volume Index',
    description: 'Cumulative price index updated only when volume rises.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{
        id: 'line', name: 'PVI',
        defaultStyle: lineStyle('#42a5f5'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: () => new PositiveVolumeIndexProcessor(),
});

export const PsychologicalLineIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'PsychologicalLine',
    name: 'Psychological Line',
    description: 'Ratio of advancing closes in StockSharp\'s trailing psychological window.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(20)],
    outputs: [{
        id: 'line', name: 'Psychological Line',
        defaultStyle: lineStyle('#7e57c2'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new PsychologicalLineProcessor(
        resolvedLength(parameters, 20),
    ),
});

export const PriceVolumeTrendIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'PriceVolumeTrend',
    name: 'Price Volume Trend',
    description: 'Cumulative volume weighted by the relative change in closing price.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{
        id: 'line', name: 'PVT',
        defaultStyle: lineStyle('#26c6da'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Volume,
    processorFactory: () => new PriceVolumeTrendProcessor(),
});

export const OnBalanceVolumeIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'OnBalanceVolume',
    name: 'On-Balance Volume',
    description: 'Cumulative volume signed by the direction of the closing price.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'OBV', defaultStyle: lineStyle('#ab47bc') }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Volume,
    processorFactory: () => new OnBalanceVolumeProcessor(),
});

export const OnBalanceVolumeMeanIndicator: IndicatorDefinition<
    IndicatorCandle,
    MomentumLengthParameters
> = registerIndicator({
    id: 'OnBalanceVolumeMean',
    name: 'On-Balance Volume Mean',
    description: 'Simple moving average of the cumulative On-Balance Volume series.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14)],
    outputs: [{
        id: 'line', name: 'OBV Mean',
        defaultStyle: lineStyle('#42a5f5'),
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Volume,
    processorFactory: (parameters) => new OnBalanceVolumeMeanProcessor(
        resolvedPeriod(parameters?.length, 14, 'length'),
    ),
});

export const BalanceVolumeIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'BalanceVolume',
    name: 'Balance Volume',
    description: 'Balance-volume variant whose first valid bar is an empty value.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'Balance Volume', defaultStyle: lineStyle('#7e57c2') }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Volume,
    processorFactory: () => new BalanceVolumeProcessor(),
});

export const MomentumVolumeIndicators = Object.freeze([
    RelativeStrengthIndexIndicator,
    DynamicZonesRsiIndicator,
    DeMarkerIndicator,
    DemandIndexIndicator,
    DisparityIndexIndicator,
    MomentumIndicator,
    QStickIndicator,
    MomentumOfMovingAverageIndicator,
    OscillatorOfMovingAverageIndicator,
    PrettyGoodOscillatorIndicator,
    RelativeMomentumIndexIndicator,
    RangeActionVerificationIndexIndicator,
    RankCorrelationIndexIndicator,
    MomentumPinballIndicator,
    RateOfChangeIndicator,
    WilliamsRIndicator,
    StochasticKIndicator,
    MoneyFlowIndexIndicator,
    ChaikinMoneyFlowIndicator,
    ChaikinOscillatorIndicator,
    ChandeMomentumOscillatorIndicator,
    ConnorsRsiIndicator,
    EaseOfMovementIndicator,
    ApprovalFlowIndexIndicator,
    ForceIndexIndicator,
    ForecastOscillatorIndicator,
    FiniteVolumeElementIndicator,
    HighLowIndexIndicator,
    IntradayIntensityIndexIndicator,
    IntradayMomentumIndexIndicator,
    VolumeWeightedMovingAverageIndicator,
    PercentageVolumeOscillatorIndicator,
    TwiggsMoneyFlowIndicator,
    UltimateOscillatorIndicator,
    VolumeIndicator,
    MarketFacilitationIndexIndicator,
    NegativeVolumeIndexIndicator,
    PositiveVolumeIndexIndicator,
    PsychologicalLineIndicator,
    PriceVolumeTrendIndicator,
    OnBalanceVolumeIndicator,
    OnBalanceVolumeMeanIndicator,
    BalanceVolumeIndicator,
] as const);
