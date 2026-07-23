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
    AverageTrueRange,
    ExponentialMovingAverage,
    FixedWeightedMovingAverage,
    LinearWeightedMovingAverage,
    RingBuffer,
    RollingMaximum,
    RollingLinearRegression,
    RollingMeanDeviation,
    RollingMedian,
    RollingMinimum,
    RollingStandardDeviation,
    RollingSum,
    SimpleMovingAverage,
    WilderMovingAverage,
    type AverageTrueRangeCheckpoint,
    type RingBufferCheckpoint,
    type RollingWindowCheckpoint,
    type RollingLinearRegressionCheckpoint,
    type SeededMovingAverageCheckpoint,
} from '../math/index.js';

export interface LengthIndicatorParameters extends IndicatorParameters {
    readonly length: number;
}

export interface TrueRangeIndicatorCheckpoint {
    readonly previousClose: number | null;
}

export interface ZeroLagExponentialMovingAverageCheckpoint {
    readonly prices: RingBufferCheckpoint<number | null>;
    readonly previous: number;
}

export interface ArnaudLegouxMovingAverageParameters extends IndicatorParameters {
    readonly length: number;
    readonly offset: number;
    readonly sigma: number;
}

export interface JurikMovingAverageParameters extends IndicatorParameters {
    readonly length: number;
    readonly phase: number;
}

export interface JurikMovingAverageCheckpoint {
    readonly formed: boolean;
    readonly previousMa1: number;
    readonly previousMa2: number;
}

export interface KalmanFilterParameters extends IndicatorParameters {
    readonly length: number;
    readonly processNoise: number;
    readonly measurementNoise: number;
}

export interface KalmanFilterCheckpoint {
    readonly lastEstimate: number | null;
    readonly errorCovariance: number;
    readonly count: number;
}

function resolvedLength(
    parameters: LengthIndicatorParameters,
    fallback: number,
    minimum: number,
): number {
    return resolvedInteger(parameters?.length, fallback, minimum, 500, 'length');
}

function resolvedInteger(
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

function close(input: IndicatorProcessInput<IndicatorCandle>): number | null {
    const value = input.value?.close;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resolvedNumber(
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

function resolvedPositive(value: unknown, fallback: number, name: string): number {
    const resolved = value ?? fallback;
    if (typeof resolved !== 'number' || !Number.isFinite(resolved) || resolved <= 0) {
        throw new RangeError(`sschart: indicator ${name} must be a positive finite number`);
    }
    return resolved;
}

function almaWeights(length: number, offset: number, sigma: number): readonly number[] {
    resolvedInteger(length, length, 1, 500, 'length');
    resolvedNumber(offset, 0.85, 0.001, 1, 'offset');
    resolvedInteger(sigma, sigma, 1, 500, 'sigma');
    const center = offset * (length - 1);
    const width = length / sigma;
    return Object.freeze(Array.from({ length }, (_, index) => {
        const distance = (index - center) / width;
        return Math.exp(-(distance * distance) / 2);
    }));
}

export class SimpleMovingAverageProcessor extends SequentialIndicatorProcessor<
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
        const value = commit
            ? this.average.push(close(input))
            : this.average.preview(close(input));
        return {
            isFormed: this.average.isFormed || value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void { this.average.restore(state); }
}

export class ArnaudLegouxMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly average: FixedWeightedMovingAverage;

    constructor(
        readonly length: number,
        readonly offset: number,
        readonly sigma: number,
    ) {
        super(['line']);
        this.average = new FixedWeightedMovingAverage(almaWeights(length, offset, sigma));
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = commit
            ? this.average.push(close(input))
            : this.average.preview(close(input));
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void { this.average.restore(state); }
}

export class EndpointMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RingBufferCheckpoint<number | null>
> {
    private readonly values: RingBuffer<number | null>;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Endpoint Moving Average length must be an integer from 1 to 500',
            );
        }
        this.values = new RingBuffer<number | null>(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const current = close(input);
        let first: number | null | undefined;

        if (commit) {
            this.values.push(current);
            first = this.values.full ? this.values.front() : undefined;
        } else if (this.length > 1 && this.values.size + 1 >= this.length) {
            first = this.values.full ? this.values.at(1) : this.values.front();
        }

        let value: number | null = null;
        if (this.length > 1 && typeof first === 'number' && current !== null) {
            const slope = (current - first) / (this.length - 1);
            const candidate = first + slope * (this.length - 1);
            value = Number.isFinite(candidate) ? candidate : null;
        }

        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.values.clear(); }
    protected captureState(): RingBufferCheckpoint<number | null> {
        return this.values.checkpoint();
    }
    protected restoreState(state: RingBufferCheckpoint<number | null>): void {
        if (state === null || typeof state !== 'object' || !Array.isArray(state.values)
            || state.values.some((value) => (
                value !== null && (typeof value !== 'number' || !Number.isFinite(value))
            ))) {
            throw new TypeError('sschart: invalid Endpoint Moving Average checkpoint');
        }
        this.values.restore(state);
    }
}

export class JurikMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    JurikMovingAverageCheckpoint
> {
    private formed = false;
    private previousMa1 = 0;
    private previousMa2 = 0;
    private readonly beta: number;
    private readonly phaseRatio: number;

    constructor(readonly length: number, readonly phase: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Jurik Moving Average length must be an integer from 1 to 500',
            );
        }
        if (!Number.isInteger(phase) || phase < -100 || phase > 100) {
            throw new RangeError(
                'sschart: Jurik Moving Average phase must be an integer from -100 to 100',
            );
        }
        this.beta = 0.45 * (length - 1) / (0.45 * (length - 1) + 2);
        this.phaseRatio = (phase + 100) / 200;
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const price = close(input);
        if (price === null) {
            return {
                isFormed: this.formed,
                values: [this.output('line', null, input.index)],
            };
        }

        if (!this.formed) {
            const becomesFormed = input.index + 1 >= this.length;
            if (commit) {
                this.previousMa1 = price;
                this.previousMa2 = price;
                this.formed = becomesFormed;
            }
            return {
                isFormed: becomesFormed,
                values: [this.output('line', becomesFormed ? price : null, input.index)],
            };
        }

        const ma1 = this.previousMa1 + this.beta * (price - this.previousMa1);
        const ma2 = this.previousMa2 + this.beta * (ma1 - this.previousMa2);
        const value = ma2 + this.phaseRatio * (ma2 - this.previousMa2);
        if (commit) {
            this.previousMa1 = ma1;
            this.previousMa2 = ma2;
        }
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.formed = false;
        this.previousMa1 = 0;
        this.previousMa2 = 0;
    }

    protected captureState(): JurikMovingAverageCheckpoint {
        return Object.freeze({
            formed: this.formed,
            previousMa1: this.previousMa1,
            previousMa2: this.previousMa2,
        });
    }

    protected restoreState(state: JurikMovingAverageCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || typeof state.formed !== 'boolean'
            || typeof state.previousMa1 !== 'number' || !Number.isFinite(state.previousMa1)
            || typeof state.previousMa2 !== 'number' || !Number.isFinite(state.previousMa2)) {
            throw new TypeError('sschart: invalid Jurik Moving Average checkpoint');
        }
        this.formed = state.formed;
        this.previousMa1 = state.previousMa1;
        this.previousMa2 = state.previousMa2;
    }
}

export class KalmanFilterProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    KalmanFilterCheckpoint
> {
    private lastEstimate: number | null = null;
    private errorCovariance = 1;
    private count = 0;

    constructor(
        readonly length: number,
        readonly processNoise: number,
        readonly measurementNoise: number,
    ) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Kalman Filter length must be an integer from 1 to 500',
            );
        }
        if (!Number.isFinite(processNoise) || processNoise <= 0) {
            throw new RangeError('sschart: Kalman Filter process noise must be positive and finite');
        }
        if (!Number.isFinite(measurementNoise) || measurementNoise <= 0) {
            throw new RangeError(
                'sschart: Kalman Filter measurement noise must be positive and finite',
            );
        }
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const measurement = close(input);
        if (measurement === null) {
            return {
                isFormed: this.count >= this.length,
                values: [this.output('line', null, input.index)],
            };
        }

        let estimate = measurement;
        let nextErrorCovariance = 1;
        if (this.lastEstimate !== null) {
            const priorErrorCovariance = this.errorCovariance + this.processNoise;
            const kalmanGain = priorErrorCovariance
                / (priorErrorCovariance + this.measurementNoise);
            estimate = this.lastEstimate + kalmanGain * (measurement - this.lastEstimate);
            nextErrorCovariance = (1 - kalmanGain) * priorErrorCovariance;
        }
        const nextCount = Math.min(this.length, this.count + 1);
        if (commit) {
            this.lastEstimate = estimate;
            this.errorCovariance = nextErrorCovariance;
            this.count = nextCount;
        }
        const formed = nextCount >= this.length;
        return {
            isFormed: formed,
            values: [this.output('line', formed ? estimate : null, input.index)],
        };
    }

    protected resetState(): void {
        this.lastEstimate = null;
        this.errorCovariance = 1;
        this.count = 0;
    }

    protected captureState(): KalmanFilterCheckpoint {
        return Object.freeze({
            lastEstimate: this.lastEstimate,
            errorCovariance: this.errorCovariance,
            count: this.count,
        });
    }

    protected restoreState(state: KalmanFilterCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || (state.lastEstimate !== null
                && (typeof state.lastEstimate !== 'number'
                    || !Number.isFinite(state.lastEstimate)))
            || typeof state.errorCovariance !== 'number'
            || !Number.isFinite(state.errorCovariance) || state.errorCovariance < 0
            || !Number.isInteger(state.count) || state.count < 0 || state.count > this.length
            || (state.count === 0) !== (state.lastEstimate === null)) {
            throw new TypeError('sschart: invalid Kalman Filter checkpoint');
        }
        this.lastEstimate = state.lastEstimate;
        this.errorCovariance = state.errorCovariance;
        this.count = state.count;
    }
}

export class LinearRegressionForecastProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingLinearRegressionCheckpoint
> {
    private readonly regression: RollingLinearRegression;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 2 || length > 500) {
            throw new RangeError(
                'sschart: Linear Regression Forecast length must be an integer from 2 to 500',
            );
        }
        this.regression = new RollingLinearRegression(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        let value: number | null;
        if (commit) {
            this.regression.push(close(input));
            value = this.regression.nextValue;
        } else {
            value = this.regression.previewNext(close(input));
        }
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

export class LinearRegressionProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingLinearRegressionCheckpoint
> {
    private readonly regression: RollingLinearRegression;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Linear Reg length must be an integer from 1 to 500',
            );
        }
        this.regression = new RollingLinearRegression(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = commit
            ? this.regression.push(close(input))
            : this.regression.preview(close(input));
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

export class LinearRegressionSlopeProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingLinearRegressionCheckpoint
> {
    private readonly regression: RollingLinearRegression;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 2 || length > 500) {
            throw new RangeError(
                'sschart: Linear Reg Slope length must be an integer from 2 to 500',
            );
        }
        this.regression = new RollingLinearRegression(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        let value: number | null;
        if (commit) {
            this.regression.push(close(input));
            value = this.regression.slopeValue;
        } else {
            value = this.regression.previewSlope(close(input));
        }
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

export class LinearRegressionRSquaredProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingLinearRegressionCheckpoint
> {
    private readonly regression: RollingLinearRegression;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Linear Reg R Squared length must be an integer from 1 to 500',
            );
        }
        this.regression = new RollingLinearRegression(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        let value: number | null;
        if (commit) {
            this.regression.push(close(input));
            value = this.regression.rSquaredValue;
        } else {
            value = this.regression.previewRSquared(close(input));
        }
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

export class StandardErrorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingLinearRegressionCheckpoint
> {
    private readonly regression: RollingLinearRegression;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 2 || length > 500) {
            throw new RangeError(
                'sschart: Standard Error length must be an integer from 2 to 500',
            );
        }
        this.regression = new RollingLinearRegression(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        let value: number | null;
        if (commit) {
            this.regression.push(close(input));
            value = this.regression.standardErrorValue;
        } else {
            value = this.regression.previewStandardError(close(input));
        }
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

export class ExponentialMovingAverageProcessor extends SequentialIndicatorProcessor<
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
        const value = commit
            ? this.average.push(close(input))
            : this.average.preview(close(input));
        return {
            isFormed: this.average.isFormed || value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): SeededMovingAverageCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: SeededMovingAverageCheckpoint): void { this.average.restore(state); }
}

export class WeightedMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly average: LinearWeightedMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        this.average = new LinearWeightedMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = commit
            ? this.average.push(close(input))
            : this.average.preview(close(input));
        return {
            isFormed: this.average.isFormed || value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void { this.average.restore(state); }
}

export class StandardDeviationProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly deviation: RollingStandardDeviation;

    constructor(readonly length: number) {
        super(['line']);
        this.deviation = new RollingStandardDeviation(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = commit
            ? this.deviation.push(close(input))
            : this.deviation.preview(close(input));
        return {
            isFormed: this.deviation.isFormed || value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.deviation.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.deviation.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void {
        this.deviation.restore(state);
    }
}

export class MeanDeviationProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly deviation: RollingMeanDeviation;

    constructor(readonly length: number) {
        super(['line']);
        this.deviation = new RollingMeanDeviation(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = commit
            ? this.deviation.push(close(input))
            : this.deviation.preview(close(input));
        return {
            isFormed: this.deviation.isFormed || value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.deviation.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.deviation.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void {
        this.deviation.restore(state);
    }
}

export class MedianProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly median: RollingMedian;

    constructor(readonly length: number) {
        super(['line']);
        this.median = new RollingMedian(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = commit
            ? this.median.push(close(input))
            : this.median.preview(close(input));
        return {
            isFormed: this.median.isFormed || value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.median.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.median.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void { this.median.restore(state); }
}

export class SumProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly sum: RollingSum;

    constructor(readonly length: number) {
        super(['line']);
        this.sum = new RollingSum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = commit
            ? this.sum.push(close(input))
            : this.sum.preview(close(input));
        return {
            isFormed: this.sum.isFormed || value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.sum.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.sum.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void { this.sum.restore(state); }
}

export class HighestProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly maximum: RollingMaximum;

    constructor(readonly length: number) {
        super(['line']);
        this.maximum = new RollingMaximum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = input.value?.high;
        const value = commit
            ? this.maximum.push(high)
            : this.maximum.preview(high);
        return {
            isFormed: this.maximum.isFormed || value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.maximum.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.maximum.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void {
        this.maximum.restore(state);
    }
}

export class LowestProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly minimum: RollingMinimum;

    constructor(readonly length: number) {
        super(['line']);
        this.minimum = new RollingMinimum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const low = input.value?.low;
        const value = commit
            ? this.minimum.push(low)
            : this.minimum.preview(low);
        return {
            isFormed: this.minimum.isFormed || value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.minimum.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.minimum.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void {
        this.minimum.restore(state);
    }
}

export class SmoothedMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    SeededMovingAverageCheckpoint
> {
    private readonly average: WilderMovingAverage;

    constructor(readonly length: number) {
        super(['line']);
        this.average = new WilderMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = commit
            ? this.average.push(close(input))
            : this.average.preview(close(input));
        return {
            isFormed: this.average.isFormed || value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): SeededMovingAverageCheckpoint {
        return this.average.checkpoint();
    }
    protected restoreState(state: SeededMovingAverageCheckpoint): void {
        this.average.restore(state);
    }
}

/** Public Wilder indicator shares the same seeded recursion as batch SMMA. */
export class WilderMovingAverageProcessor extends SmoothedMovingAverageProcessor {}

export class ZeroLagExponentialMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ZeroLagExponentialMovingAverageCheckpoint
> {
    private readonly prices: RingBuffer<number | null>;
    private readonly lag: number;
    private readonly multiplier: number;
    private previous = 0;

    constructor(readonly length: number) {
        super(['line']);
        resolvedInteger(length, length, 1, 500, 'length');
        this.prices = new RingBuffer(length);
        this.lag = Math.floor((length - 1) / 2);
        this.multiplier = 2 / (length + 1);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const current = close(input);
        const window = this.prices.toArray();
        if (window.length === this.length) window.shift();
        window.push(current);
        if (commit) this.prices.push(current);
        if (window.length < this.length) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const lagged = window[this.lag];
        if (current === null || lagged === null) {
            return {
                isFormed: true,
                values: [this.output('line', null, input.index)],
            };
        }
        const value = this.multiplier * (2 * current - lagged)
            + (1 - this.multiplier) * this.previous;
        if (commit) this.previous = value;
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.prices.clear();
        this.previous = 0;
    }

    protected captureState(): ZeroLagExponentialMovingAverageCheckpoint {
        return Object.freeze({
            prices: this.prices.checkpoint(),
            previous: this.previous,
        });
    }

    protected restoreState(state: ZeroLagExponentialMovingAverageCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.prices?.values)
            || state.prices.values.length > this.length
            || state.prices.values.some((value) => (
                value !== null && (typeof value !== 'number' || !Number.isFinite(value))
            ))
            || typeof state.previous !== 'number' || !Number.isFinite(state.previous)) {
            throw new TypeError('sschart: invalid ZLEMA checkpoint');
        }
        this.prices.restore(state.prices);
        this.previous = state.previous;
    }
}

export class AverageTrueRangeProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    AverageTrueRangeCheckpoint
> {
    private readonly average: AverageTrueRange;

    constructor(readonly length: number) {
        super(['line']);
        this.average = new AverageTrueRange(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = commit
            ? this.average.push(input.value)
            : this.average.preview(input.value);
        return {
            isFormed: this.average.isFormed || value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): AverageTrueRangeCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: AverageTrueRangeCheckpoint): void { this.average.restore(state); }
}

export class TrueRangeProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    TrueRangeIndicatorCheckpoint
> {
    private previousClose: number | null = null;

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = input.value?.high;
        const low = input.value?.low;
        const closeValue = close(input);
        if (typeof high !== 'number' || !Number.isFinite(high)
            || typeof low !== 'number' || !Number.isFinite(low)) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }
        if (this.previousClose === null) {
            if (commit && closeValue !== null) this.previousClose = closeValue;
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }
        const value = Math.max(
            high - low,
            Math.abs(this.previousClose - high),
            Math.abs(this.previousClose - low),
        );
        if (commit && closeValue !== null) this.previousClose = closeValue;
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.previousClose = null; }
    protected captureState(): TrueRangeIndicatorCheckpoint {
        return Object.freeze({ previousClose: this.previousClose });
    }
    protected restoreState(state: TrueRangeIndicatorCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || (state.previousClose !== null
                && (typeof state.previousClose !== 'number'
                    || !Number.isFinite(state.previousClose)))) {
            throw new TypeError('sschart: invalid True Range checkpoint');
        }
        this.previousClose = state.previousClose;
    }
}

const LENGTH_STYLE = Object.freeze({
    series: IndicatorSeriesStyle.Line,
    lineWidth: 2,
    options: Object.freeze({ priceLineVisible: false }),
});

export const SimpleMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'SimpleMovingAverage',
    name: 'SMA',
    description: 'Arithmetic mean of closing prices over a fixed rolling window.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        description: 'Number of closing prices in the rolling window.',
        type: IndicatorParameterType.Integer,
        defaultValue: 20,
        min: 2,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'SMA',
        defaultStyle: { ...LENGTH_STYLE, color: '#f5c542' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new SimpleMovingAverageProcessor(
        resolvedLength(parameters, 20, 2),
    ),
});

export const ExponentialMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'ExponentialMovingAverage',
    name: 'EMA',
    description: 'Exponentially weighted moving average seeded by a full-window SMA.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        description: 'SMA seed and exponential smoothing length.',
        type: IndicatorParameterType.Integer,
        defaultValue: 20,
        min: 2,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'EMA',
        defaultStyle: { ...LENGTH_STYLE, color: '#26a69a' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new ExponentialMovingAverageProcessor(
        resolvedLength(parameters, 20, 2),
    ),
});

export const WeightedMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'WeightedMovingAverage',
    name: 'Weighted Moving Average',
    description: 'Linear moving average weighted from one to the configured length.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        description: 'Number of closing prices in the weighted rolling window.',
        type: IndicatorParameterType.Integer,
        defaultValue: 20,
        min: 1,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'WMA',
        defaultStyle: { ...LENGTH_STYLE, color: '#42a5f5' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new WeightedMovingAverageProcessor(
        resolvedLength(parameters, 20, 1),
    ),
});

export const ArnaudLegouxMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    ArnaudLegouxMovingAverageParameters
> = registerIndicator({
    id: 'ArnaudLegouxMovingAverage',
    name: 'Arnaud Legoux Moving Average',
    description: 'StockSharp-oriented Gaussian weighted moving average of closing prices.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 9, min: 1, max: 500, step: 1,
        },
        {
            id: 'offset', name: 'Offset', type: IndicatorParameterType.Number,
            defaultValue: 0.85, min: 0.001, max: 1, step: 0.001,
        },
        {
            id: 'sigma', name: 'Sigma', type: IndicatorParameterType.Integer,
            defaultValue: 6, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'line',
        name: 'ALMA',
        defaultStyle: { ...LENGTH_STYLE, color: '#5c6bc0' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new ArnaudLegouxMovingAverageProcessor(
        resolvedLength(parameters, 9, 1),
        resolvedNumber(parameters?.offset, 0.85, 0.001, 1, 'offset'),
        resolvedInteger(parameters?.sigma, 6, 1, 500, 'sigma'),
    ),
});

export const EndpointMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'EndpointMovingAverage',
    name: 'Endpoint Moving Average',
    description: 'StockSharp endpoint moving average over a fixed close-price window.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        description: 'Number of closing prices in the endpoint window.',
        type: IndicatorParameterType.Integer,
        defaultValue: 10,
        min: 1,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'EPMA',
        defaultStyle: { ...LENGTH_STYLE, color: '#26c6da' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new EndpointMovingAverageProcessor(
        resolvedLength(parameters, 10, 1),
    ),
});

export const JurikMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    JurikMovingAverageParameters
> = registerIndicator({
    id: 'JurikMovingAverage',
    name: 'Jurik Moving Average',
    description: 'Low-lag two-stage Jurik-style smoothing with configurable phase response.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 20, min: 1, max: 500, step: 1,
        },
        {
            id: 'phase', name: 'Phase', type: IndicatorParameterType.Integer,
            defaultValue: 0, min: -100, max: 100, step: 1,
        },
    ],
    outputs: [{
        id: 'line',
        name: 'JMA',
        defaultStyle: { ...LENGTH_STYLE, color: '#ab47bc' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new JurikMovingAverageProcessor(
        resolvedLength(parameters, 20, 1),
        resolvedInteger(parameters?.phase, 0, -100, 100, 'phase'),
    ),
});

export const KalmanFilterIndicator: IndicatorDefinition<
    IndicatorCandle,
    KalmanFilterParameters
> = registerIndicator({
    id: 'KalmanFilter',
    name: 'Kalman Filter',
    description: 'Adaptive one-dimensional price estimate with configurable process and measurement noise.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 10, min: 1, max: 500, step: 1,
        },
        {
            id: 'processNoise', name: 'Process Noise', type: IndicatorParameterType.Number,
            defaultValue: 0.00001, min: 1e-12, max: 1e12, step: 0.00001,
        },
        {
            id: 'measurementNoise', name: 'Measurement Noise',
            type: IndicatorParameterType.Number,
            defaultValue: 0.001, min: 1e-12, max: 1e12, step: 0.001,
        },
    ],
    outputs: [{
        id: 'line',
        name: 'Kalman',
        defaultStyle: { ...LENGTH_STYLE, color: '#26a69a' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new KalmanFilterProcessor(
        resolvedLength(parameters, 10, 1),
        resolvedPositive(parameters?.processNoise, 0.00001, 'processNoise'),
        resolvedPositive(parameters?.measurementNoise, 0.001, 'measurementNoise'),
    ),
});

export const LinearRegressionForecastIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'LinearRegressionForecast',
    name: 'Linear Regression Forecast',
    description: 'One-bar-ahead least-squares forecast from a fixed trailing close window.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        type: IndicatorParameterType.Integer,
        defaultValue: 14,
        min: 2,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Forecast',
        defaultStyle: { ...LENGTH_STYLE, color: '#5c6bc0' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new LinearRegressionForecastProcessor(
        resolvedLength(parameters, 14, 2),
    ),
});

export const LinearRegressionIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'LinearReg',
    name: 'Linear Reg',
    description: 'Least-squares endpoint over a fixed trailing close-price window.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        type: IndicatorParameterType.Integer,
        defaultValue: 11,
        min: 1,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Linear Regression',
        defaultStyle: { ...LENGTH_STYLE, color: '#26a69a' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new LinearRegressionProcessor(
        resolvedLength(parameters, 11, 1),
    ),
});

export const LinearRegressionSlopeIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'LinearRegSlope',
    name: 'Linear Reg Slope',
    description: 'Least-squares slope over a fixed trailing close-price window.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        type: IndicatorParameterType.Integer,
        defaultValue: 11,
        min: 2,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Slope',
        defaultStyle: { ...LENGTH_STYLE, color: '#ef5350' },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new LinearRegressionSlopeProcessor(
        resolvedLength(parameters, 11, 2),
    ),
});

export const LinearRegressionRSquaredIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'LinearRegRSquared',
    name: 'Linear Reg R Squared',
    description: 'Coefficient of determination for a trailing close-price regression.',
    category: IndicatorCategory.Statistical,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        type: IndicatorParameterType.Integer,
        defaultValue: 10,
        min: 1,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'R Squared',
        defaultStyle: { ...LENGTH_STYLE, color: '#7e57c2' },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new LinearRegressionRSquaredProcessor(
        resolvedLength(parameters, 10, 1),
    ),
});

export const StandardErrorIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'StandardError',
    name: 'Standard Error',
    description: 'Residual standard error of a least-squares close-price regression.',
    category: IndicatorCategory.Statistical,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        description: 'Number of closing prices in the regression window.',
        type: IndicatorParameterType.Integer,
        defaultValue: 10,
        min: 2,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Standard Error',
        defaultStyle: { ...LENGTH_STYLE, color: '#78909c' },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new StandardErrorProcessor(
        resolvedLength(parameters, 10, 2),
    ),
});

export const StandardDeviationIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'StandardDeviation',
    name: 'Standard Deviation',
    description: 'Population standard deviation of the rolling close-price window.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        description: 'Number of closing prices in the population window.',
        type: IndicatorParameterType.Integer,
        defaultValue: 10,
        min: 1,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'StdDev',
        defaultStyle: { ...LENGTH_STYLE, color: '#8d6e63' },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new StandardDeviationProcessor(
        resolvedLength(parameters, 10, 1),
    ),
});

export const MeanDeviationIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'MeanDeviation',
    name: 'Mean Deviation',
    description: 'Mean absolute deviation from the mean of a rolling close-price window.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        description: 'Number of closing prices in the deviation window.',
        type: IndicatorParameterType.Integer,
        defaultValue: 5,
        min: 1,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Mean Deviation',
        defaultStyle: { ...LENGTH_STYLE, color: '#7e57c2' },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new MeanDeviationProcessor(
        resolvedLength(parameters, 5, 1),
    ),
});

export const MedianIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'Median',
    name: 'Median',
    description: 'Moving median of a fixed trailing close-price window.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        description: 'Number of closing prices in the median window.',
        type: IndicatorParameterType.Integer,
        defaultValue: 5,
        min: 1,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Median',
        defaultStyle: { ...LENGTH_STYLE, color: '#26a69a' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new MedianProcessor(
        resolvedLength(parameters, 5, 1),
    ),
});

export const SumIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'Sum',
    name: 'Sum',
    description: 'Rolling sum of closing prices over the configured window.',
    category: IndicatorCategory.Statistical,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 15, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Sum',
        defaultStyle: { ...LENGTH_STYLE, color: '#78909c' },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: (parameters) => new SumProcessor(
        resolvedLength(parameters, 15, 1),
    ),
});

export const HighestIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'Highest',
    name: 'Highest',
    description: 'Highest candle high in the configured trailing window.',
    category: IndicatorCategory.SupportResistance,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 5, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Highest',
        defaultStyle: { ...LENGTH_STYLE, color: '#26a69a' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new HighestProcessor(
        resolvedLength(parameters, 5, 1),
    ),
});

export const LowestIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'Lowest',
    name: 'Lowest',
    description: 'Lowest candle low in the configured trailing window.',
    category: IndicatorCategory.SupportResistance,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 5, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Lowest',
        defaultStyle: { ...LENGTH_STYLE, color: '#ef5350' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new LowestProcessor(
        resolvedLength(parameters, 5, 1),
    ),
});

export const SmoothedMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'SmoothedMovingAverage',
    name: 'Smoothed Moving Average',
    description: 'Wilder-smoothed closing price seeded by a full-window average.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        description: 'Seed window and recursive Wilder smoothing length.',
        type: IndicatorParameterType.Integer,
        defaultValue: 32,
        min: 1,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'SMMA',
        defaultStyle: { ...LENGTH_STYLE, color: '#7e57c2' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new SmoothedMovingAverageProcessor(
        resolvedLength(parameters, 32, 1),
    ),
});

export const WilderMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'WilderMovingAverage',
    name: 'Wilder Moving Average',
    description: 'Welles Wilder moving average seeded by a full-window mean.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        description: 'Seed window and recursive smoothing length.',
        type: IndicatorParameterType.Integer,
        defaultValue: 32,
        min: 1,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Wilder MA',
        defaultStyle: { ...LENGTH_STYLE, color: '#ef5350' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new WilderMovingAverageProcessor(
        resolvedLength(parameters, 32, 1),
    ),
});

export const ZeroLagExponentialMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'ZeroLagExponentialMovingAverage',
    name: 'Zero Lag Exponential Moving Average',
    description: 'Lag-compensated exponential average using StockSharp oldest-first indexing.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        type: IndicatorParameterType.Integer,
        defaultValue: 14,
        min: 1,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'ZLEMA',
        defaultStyle: { ...LENGTH_STYLE, color: '#26c6da' },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new ZeroLagExponentialMovingAverageProcessor(
        resolvedLength(parameters, 14, 1),
    ),
});

export const AverageTrueRangeIndicator: IndicatorDefinition<
    IndicatorCandle,
    LengthIndicatorParameters
> = registerIndicator({
    id: 'AverageTrueRange',
    name: 'Average True Range',
    description: 'Wilder-smoothed true range including overnight price gaps.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        description: 'Wilder smoothing length.',
        type: IndicatorParameterType.Integer,
        defaultValue: 14,
        min: 1,
        max: 500,
        step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'ATR',
        defaultStyle: { ...LENGTH_STYLE, color: '#ab47bc' },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new AverageTrueRangeProcessor(
        resolvedLength(parameters, 14, 1),
    ),
});

export const TrueRangeIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'TrueRange',
    name: 'True Range',
    description: 'Maximum intrabar range or gap from the previous valid close.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{
        id: 'line',
        name: 'TR',
        defaultStyle: { ...LENGTH_STYLE, color: '#ffa726' },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Price,
    processorFactory: () => new TrueRangeProcessor(),
});

export const CoreIncrementalIndicators = Object.freeze([
    SimpleMovingAverageIndicator,
    ExponentialMovingAverageIndicator,
    WeightedMovingAverageIndicator,
    ArnaudLegouxMovingAverageIndicator,
    EndpointMovingAverageIndicator,
    JurikMovingAverageIndicator,
    KalmanFilterIndicator,
    LinearRegressionForecastIndicator,
    LinearRegressionIndicator,
    LinearRegressionSlopeIndicator,
    LinearRegressionRSquaredIndicator,
    StandardErrorIndicator,
    StandardDeviationIndicator,
    MeanDeviationIndicator,
    MedianIndicator,
    SumIndicator,
    HighestIndicator,
    LowestIndicator,
    SmoothedMovingAverageIndicator,
    WilderMovingAverageIndicator,
    ZeroLagExponentialMovingAverageIndicator,
    AverageTrueRangeIndicator,
    TrueRangeIndicator,
] as const);
