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
    PartialSeedExponentialMovingAverage,
    RingBuffer,
    RollingMaximum,
    RollingMinimum,
    RollingStandardDeviation,
    type RingBufferCheckpoint,
    type RollingWindowCheckpoint,
    type PartialSeedExponentialMovingAverageCheckpoint,
} from '../math/index.js';

export interface VolatilityLengthParameters extends IndicatorParameters {
    readonly length: number;
}

export interface HistoricalVolatilityRatioParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
}

export interface MassIndexParameters extends IndicatorParameters {
    readonly length: number;
    readonly emaLength: number;
}

export interface ChaikinVolatilityParameters extends IndicatorParameters {
    readonly emaLength: number;
    readonly rocLength: number;
}

export interface ChaikinVolatilityCheckpoint {
    readonly averageCount: number;
    readonly averageSeedSum: number;
    readonly averageFormed: boolean;
    readonly averagePrevious: number;
    readonly history: RingBufferCheckpoint<number | null>;
}

export interface GopalakrishnanRangeIndexCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}

export interface HistoricalVolatilityRatioCheckpoint {
    readonly short: RollingWindowCheckpoint;
    readonly long: RollingWindowCheckpoint;
}

export interface MassIndexCheckpoint {
    readonly single: PartialSeedExponentialMovingAverageCheckpoint;
    readonly double: PartialSeedExponentialMovingAverageCheckpoint;
    readonly ratios: RingBufferCheckpoint<number>;
    readonly ratioSum: number;
}

interface AverageEvaluation {
    readonly count: number;
    readonly seedSum: number;
    readonly formed: boolean;
    readonly previous: number;
    readonly value: number | null;
}

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function period(value: unknown, fallback: number, name: string): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || (resolved as number) < 1 || (resolved as number) > 500)
        throw new RangeError(`sschart: ${name} must be an integer from 1 to 500`);
    return resolved as number;
}

export class ChaikinVolatilityProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ChaikinVolatilityCheckpoint
> {
    private averageCount = 0;
    private averageSeedSum = 0;
    private averageFormed = false;
    private averagePrevious = 0;
    private readonly history: RingBuffer<number | null>;

    constructor(readonly emaLength: number, readonly rocLength: number) {
        super(['line']);
        if (!Number.isInteger(emaLength) || emaLength < 1)
            throw new RangeError('sschart: Chaikin EMA length must be a positive integer');
        if (!Number.isInteger(rocLength) || rocLength < 1)
            throw new RangeError('sschart: Chaikin ROC length must be a positive integer');
        this.history = new RingBuffer(rocLength + 1);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const range = high === null || low === null ? null : finite(high - low);
        const evaluation = this.evaluateAverage(range);
        const average = evaluation.value;
        if (commit) {
            this.averageCount = evaluation.count;
            this.averageSeedSum = evaluation.seedSum;
            this.averageFormed = evaluation.formed;
            this.averagePrevious = evaluation.previous;
        }
        const past = this.history.size < this.rocLength
            ? undefined
            : this.history.at(this.history.size - this.rocLength);
        const candidate = average !== null && typeof past === 'number' && past !== 0
            ? (average - past) / past * 100
            : null;
        const value = finite(candidate);
        if (commit) this.history.push(average);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.averageCount = 0;
        this.averageSeedSum = 0;
        this.averageFormed = false;
        this.averagePrevious = 0;
        this.history.clear();
    }

    protected captureState(): ChaikinVolatilityCheckpoint {
        return Object.freeze({
            averageCount: this.averageCount,
            averageSeedSum: this.averageSeedSum,
            averageFormed: this.averageFormed,
            averagePrevious: this.averagePrevious,
            history: this.history.checkpoint(),
        });
    }

    protected restoreState(state: ChaikinVolatilityCheckpoint): void {
        const values = state?.history?.values;
        if (state === null || typeof state !== 'object'
            || !Array.isArray(values) || values.length > this.rocLength + 1
            || values.some((value) => value !== null && finite(value) === null)
            || !Number.isInteger(state.averageCount)
            || state.averageCount < 0 || state.averageCount > this.emaLength
            || finite(state.averageSeedSum) === null
            || typeof state.averageFormed !== 'boolean'
            || finite(state.averagePrevious) === null
            || state.averageFormed !== (state.averageCount === this.emaLength)) {
            throw new TypeError('sschart: invalid Chaikin Volatility checkpoint');
        }
        this.averageCount = state.averageCount;
        this.averageSeedSum = state.averageSeedSum;
        this.averageFormed = state.averageFormed;
        this.averagePrevious = state.averagePrevious;
        this.history.restore(state.history);
    }

    private evaluateAverage(value: number | null): AverageEvaluation {
        if (value === null) {
            return {
                count: this.averageCount,
                seedSum: this.averageSeedSum,
                formed: this.averageFormed,
                previous: this.averagePrevious,
                value: null,
            };
        }
        if (!this.averageFormed) {
            const count = this.averageCount + 1;
            const seedSum = this.averageSeedSum + value;
            const formed = count === this.emaLength;
            const previous = formed ? seedSum / this.emaLength : this.averagePrevious;
            return { count, seedSum, formed, previous, value: formed ? previous : null };
        }
        const multiplier = 2 / (this.emaLength + 1);
        const previous = value * multiplier + this.averagePrevious * (1 - multiplier);
        return {
            count: this.averageCount,
            seedSum: this.averageSeedSum,
            formed: true,
            previous,
            value: previous,
        };
    }
}

export class MassIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    MassIndexCheckpoint
> {
    private readonly single: PartialSeedExponentialMovingAverage;
    private readonly double: PartialSeedExponentialMovingAverage;
    private readonly ratios: RingBuffer<number>;
    private ratioSum = 0;

    constructor(readonly length: number, readonly emaLength: number) {
        super(['line']);
        period(length, length, 'length');
        period(emaLength, emaLength, 'emaLength');
        this.single = new PartialSeedExponentialMovingAverage(emaLength);
        this.double = new PartialSeedExponentialMovingAverage(emaLength);
        this.ratios = new RingBuffer(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const range = high === null || low === null ? null : finite(high - low);
        let ratio: number | null = null;

        if (range === null) {
            if (commit) {
                this.single.reset();
                this.double.reset();
            }
        } else if (commit) {
            const single = this.single.push(range);
            const double = this.double.push(single);
            if (this.single.isFormed && this.double.isFormed
                && single !== null && double !== null && double !== 0) {
                ratio = finite(single / double);
            }
        } else {
            const singleState = this.single.checkpoint();
            const doubleState = this.double.checkpoint();
            const single = this.single.preview(range);
            const double = this.double.preview(single);
            const singleFormed = this.single.isFormed
                || singleState.count + 1 === this.emaLength;
            const doubleFormed = this.double.isFormed
                || doubleState.count + 1 === this.emaLength;
            if (singleFormed && doubleFormed
                && single !== null && double !== null && double !== 0) {
                ratio = finite(single / double);
            }
        }

        let value = this.ratios.full ? this.ratioSum : null;
        if (ratio !== null) {
            const outgoing = this.ratios.full ? (this.ratios.front() as number) : 0;
            const nextSum = this.ratioSum - outgoing + ratio;
            const nextSize = Math.min(this.length, this.ratios.size + 1);
            value = nextSize === this.length ? nextSum : null;
            if (commit) {
                this.ratios.push(ratio);
                this.ratioSum = nextSum;
            }
        }

        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.single.reset();
        this.double.reset();
        this.ratios.clear();
        this.ratioSum = 0;
    }

    protected captureState(): MassIndexCheckpoint {
        return Object.freeze({
            single: this.single.checkpoint(),
            double: this.double.checkpoint(),
            ratios: this.ratios.checkpoint(),
            ratioSum: this.ratioSum,
        });
    }

    protected restoreState(state: MassIndexCheckpoint): void {
        const ratios = state?.ratios?.values;
        const rebuiltSum = Array.isArray(ratios)
            ? ratios.reduce((sum, value) => sum + value, 0)
            : 0;
        const tolerance = Math.max(1, Math.abs(rebuiltSum)) * Number.EPSILON * 128;
        if (state === null || typeof state !== 'object'
            || !Array.isArray(ratios) || ratios.length > this.length
            || ratios.some((value) => finite(value) === null)
            || finite(state.ratioSum) === null
            || Math.abs(state.ratioSum - rebuiltSum) > tolerance) {
            throw new TypeError('sschart: invalid Mass Index checkpoint');
        }
        this.single.restore(state.single);
        this.double.restore(state.double);
        this.ratios.restore(state.ratios);
        this.ratioSum = state.ratioSum;
    }
}

export class GopalakrishnanRangeIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    GopalakrishnanRangeIndexCheckpoint
> {
    private readonly high: RollingMaximum;
    private readonly low: RollingMinimum;
    private readonly logLength: number | null;

    constructor(readonly length: number) {
        super(['line']);
        period(length, length, 'length');
        this.high = new RollingMaximum(length);
        this.low = new RollingMinimum(length);
        this.logLength = length > 1 ? Math.log(length) : null;
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
        if (this.logLength !== null && maximum !== null && minimum !== null
            && currentHigh !== null && currentLow !== null) {
            const currentRange = currentHigh - currentLow;
            const candidate = currentRange > 0
                ? Math.log((maximum - minimum) / currentRange) / this.logLength
                : 0;
            value = finite(candidate);
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

    protected captureState(): GopalakrishnanRangeIndexCheckpoint {
        return Object.freeze({
            high: this.high.checkpoint(),
            low: this.low.checkpoint(),
        });
    }

    protected restoreState(state: GopalakrishnanRangeIndexCheckpoint): void {
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
            throw new TypeError('sschart: invalid Gopalakrishnan Range Index checkpoint');
        }
        this.high.restore(state.high);
        this.low.restore(state.low);
    }
}

export class HistoricalVolatilityRatioProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    HistoricalVolatilityRatioCheckpoint
> {
    private readonly short: RollingStandardDeviation;
    private readonly long: RollingStandardDeviation;

    constructor(readonly shortPeriod: number, readonly longPeriod: number) {
        super(['line']);
        period(shortPeriod, shortPeriod, 'shortPeriod');
        period(longPeriod, longPeriod, 'longPeriod');
        this.short = new RollingStandardDeviation(shortPeriod);
        this.long = new RollingStandardDeviation(longPeriod);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const short = commit ? this.short.push(close) : this.short.preview(close);
        const long = commit ? this.long.push(close) : this.long.preview(close);
        const value = short === null || long === null
            ? null
            : (long === 0 ? 0 : finite(short / long));
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.short.reset();
        this.long.reset();
    }

    protected captureState(): HistoricalVolatilityRatioCheckpoint {
        return Object.freeze({
            short: this.short.checkpoint(),
            long: this.long.checkpoint(),
        });
    }

    protected restoreState(state: HistoricalVolatilityRatioCheckpoint): void {
        if (state === null || typeof state !== 'object') {
            throw new TypeError('sschart: invalid Historical Volatility Ratio checkpoint');
        }
        this.short.restore(state.short);
        this.long.restore(state.long);
    }
}

export const ChaikinVolatilityIndicator: IndicatorDefinition<
    IndicatorCandle,
    ChaikinVolatilityParameters
> = registerIndicator({
    id: 'ChaikinVolatility',
    name: 'Chaikin Volatility',
    description: 'Rate of change of an exponential average of candle ranges.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'emaLength', name: 'EMA Length', type: IndicatorParameterType.Integer,
            defaultValue: 32, min: 1, max: 500, step: 1,
        },
        {
            id: 'rocLength', name: 'ROC Length', type: IndicatorParameterType.Integer,
            defaultValue: 5, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'line',
        name: 'Chaikin Volatility',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#ab47bc',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new ChaikinVolatilityProcessor(
        period(parameters?.emaLength, 32, 'emaLength'),
        period(parameters?.rocLength, 5, 'rocLength'),
    ),
});

export const MassIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    MassIndexParameters
> = registerIndicator({
    id: 'MassIndex',
    name: 'Mass Index',
    description: 'Rolling sum of the ratio between single- and double-smoothed candle ranges.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 25, min: 1, max: 500, step: 1,
        },
        {
            id: 'emaLength', name: 'EMA Length', type: IndicatorParameterType.Integer,
            defaultValue: 9, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'line', name: 'Mass Index',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#ab47bc',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new MassIndexProcessor(
        period(parameters?.length, 25, 'length'),
        period(parameters?.emaLength, 9, 'emaLength'),
    ),
});

export const GopalakrishnanRangeIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    VolatilityLengthParameters
> = registerIndicator({
    id: 'GopalakrishnanRangeIndex',
    name: 'Gopalakrishnan Range Index',
    description: 'Log ratio of the rolling price range to the current candle range.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 14, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Gopalakrishnan Range Index',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#42a5f5',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: (parameters) => new GopalakrishnanRangeIndexProcessor(
        period(parameters?.length, 14, 'length'),
    ),
});

export const HistoricalVolatilityRatioIndicator: IndicatorDefinition<
    IndicatorCandle,
    HistoricalVolatilityRatioParameters
> = registerIndicator({
    id: 'HistoricalVolatilityRatio',
    name: 'Historical Volatility Ratio',
    description: 'Ratio of short and long population deviations of closing price.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortPeriod', name: 'Short Period', type: IndicatorParameterType.Integer,
            defaultValue: 5, min: 1, max: 500, step: 1,
        },
        {
            id: 'longPeriod', name: 'Long Period', type: IndicatorParameterType.Integer,
            defaultValue: 20, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'line',
        name: 'Historical Volatility Ratio',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#ab47bc',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new HistoricalVolatilityRatioProcessor(
        period(parameters?.shortPeriod, 5, 'shortPeriod'),
        period(parameters?.longPeriod, 20, 'longPeriod'),
    ),
});

export const VolatilityIndicators = Object.freeze([
    ChaikinVolatilityIndicator,
    MassIndexIndicator,
    GopalakrishnanRangeIndexIndicator,
    HistoricalVolatilityRatioIndicator,
] as const);
