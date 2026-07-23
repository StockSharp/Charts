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
    ExpandingWilderMovingAverage,
    RingBuffer,
    RollingMaximum,
    RollingMinimum,
    type ExpandingWilderMovingAverageCheckpoint,
    type RingBufferCheckpoint,
} from '../math/index.js';
import { CommodityChannelIndexKernel } from '../math/commodity-channel-index.js';

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resolvedLength(
    parameters: RecursiveLengthParameters,
    fallback: number,
    minimum: number,
    maximum: number,
): number {
    const value = parameters?.length ?? fallback;
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new RangeError(
            `sschart: indicator length must be an integer from ${minimum} to ${maximum}`,
        );
    }
    return value;
}

function lineStyle(color: string, width = 2) {
    return {
        series: IndicatorSeriesStyle.Line,
        color,
        lineWidth: width,
        options: { priceLineVisible: false },
    } as const;
}

function lengthParameter(defaultValue: number, minimum: number, maximum: number) {
    return {
        id: 'length',
        name: 'Length',
        type: IndicatorParameterType.Integer,
        defaultValue,
        min: minimum,
        max: maximum,
        step: 1,
    } as const;
}

export interface RecursiveLengthParameters extends IndicatorParameters {
    readonly length: number;
}

export interface FractalDimensionCheckpoint {
    readonly values: RingBufferCheckpoint<number>;
}

export interface HurstExponentCheckpoint {
    readonly values: RingBufferCheckpoint<number | null>;
}

export interface MarketMeannessIndexCheckpoint {
    readonly values: RingBufferCheckpoint<number>;
    readonly priceChanges: number;
    readonly directionChanges: number;
    readonly previousDirection: -1 | 0 | 1;
}

interface HurstWindowEvaluation {
    readonly size: number;
    readonly sum: number;
    readonly invalid: number;
}

export interface DirectionalCandleSnapshot {
    readonly high: number;
    readonly low: number;
    readonly close: number;
}

export interface DirectionalMovementCheckpoint {
    readonly previousCandle: DirectionalCandleSnapshot | null;
    readonly plus: ExpandingWilderMovingAverageCheckpoint;
    readonly minus: ExpandingWilderMovingAverageCheckpoint;
    readonly trueRange: ExpandingWilderMovingAverageCheckpoint;
}

interface DirectionalMovementResult {
    readonly plusDI: number | null;
    readonly minusDI: number | null;
    readonly dx: number | null;
}

class DirectionalMovementKernel {
    private previousCandle: DirectionalCandleSnapshot | null = null;
    private readonly plus: ExpandingWilderMovingAverage;
    private readonly minus: ExpandingWilderMovingAverage;
    private readonly trueRange: ExpandingWilderMovingAverage;

    constructor(readonly length: number) {
        this.plus = new ExpandingWilderMovingAverage(length);
        this.minus = new ExpandingWilderMovingAverage(length);
        this.trueRange = new ExpandingWilderMovingAverage(length);
    }

    process(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): DirectionalMovementResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const current = high !== null && low !== null && close !== null
            ? { high, low, close }
            : null;

        let plusMovement: number | null = null;
        let minusMovement: number | null = null;
        let trueRange: number | null = null;
        if (input.index === 0) {
            if (high !== null && low !== null) trueRange = high - low;
        } else if (high !== null && low !== null && this.previousCandle !== null) {
            const upMove = high - this.previousCandle.high;
            const downMove = this.previousCandle.low - low;
            plusMovement = upMove > downMove && upMove > 0 ? upMove : 0;
            minusMovement = downMove > upMove && downMove > 0 ? downMove : 0;
            trueRange = Math.max(
                high - low,
                Math.abs(high - this.previousCandle.close),
                Math.abs(low - this.previousCandle.close),
            );
        }

        const smoothedPlus = commit
            ? this.plus.push(plusMovement)
            : this.plus.preview(plusMovement);
        const smoothedMinus = commit
            ? this.minus.push(minusMovement)
            : this.minus.preview(minusMovement);
        const smoothedRange = commit
            ? this.trueRange.push(trueRange)
            : this.trueRange.preview(trueRange);
        if (commit) this.previousCandle = current;

        if (smoothedPlus === null || smoothedMinus === null
            || smoothedRange === null || smoothedRange === 0) {
            return { plusDI: null, minusDI: null, dx: null };
        }
        const plusDI = 100 * smoothedPlus / smoothedRange;
        const minusDI = 100 * smoothedMinus / smoothedRange;
        const sum = plusDI + minusDI;
        return {
            plusDI,
            minusDI,
            dx: sum === 0 ? 0 : 100 * Math.abs(plusDI - minusDI) / sum,
        };
    }

    reset(): void {
        this.previousCandle = null;
        this.plus.reset();
        this.minus.reset();
        this.trueRange.reset();
    }

    checkpoint(): DirectionalMovementCheckpoint {
        return Object.freeze({
            previousCandle: this.previousCandle === null
                ? null
                : Object.freeze({ ...this.previousCandle }),
            plus: this.plus.checkpoint(),
            minus: this.minus.checkpoint(),
            trueRange: this.trueRange.checkpoint(),
        });
    }

    restore(state: DirectionalMovementCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid directional movement checkpoint');
        const previous = state.previousCandle;
        if (previous !== null && (previous === undefined || typeof previous !== 'object'
            || finite(previous.high) === null || finite(previous.low) === null
            || finite(previous.close) === null)) {
            throw new TypeError('sschart: invalid directional movement checkpoint');
        }
        this.plus.restore(state.plus);
        this.minus.restore(state.minus);
        this.trueRange.restore(state.trueRange);
        this.previousCandle = previous === null ? null : Object.freeze({ ...previous });
    }
}

export interface AverageDirectionalIndexCheckpoint extends DirectionalMovementCheckpoint {
    readonly average: ExpandingWilderMovingAverageCheckpoint;
}

export class AverageDirectionalIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    AverageDirectionalIndexCheckpoint
> {
    private readonly directional: DirectionalMovementKernel;
    private readonly average: ExpandingWilderMovingAverage;

    constructor(readonly length: number) {
        super(['plusDI', 'minusDI', 'adx']);
        resolvedLength({ length }, length, 2, 100);
        this.directional = new DirectionalMovementKernel(length);
        this.average = new ExpandingWilderMovingAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const { plusDI, minusDI, dx } = this.directional.process(input, commit);

        const diFirst = this.length + 1;
        const adxRaw = commit
            ? this.average.push(input.index >= diFirst ? dx : null)
            : this.average.preview(input.index >= diFirst ? dx : null);
        const visiblePlus = input.index >= diFirst ? plusDI : null;
        const visibleMinus = input.index >= diFirst ? minusDI : null;
        const adx = input.index >= diFirst + this.length - 1 ? adxRaw : null;
        return {
            isFormed: adx !== null,
            values: [
                this.output('plusDI', visiblePlus, input.index),
                this.output('minusDI', visibleMinus, input.index),
                this.output('adx', adx, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.directional.reset();
        this.average.reset();
    }

    protected captureState(): AverageDirectionalIndexCheckpoint {
        return Object.freeze({
            ...this.directional.checkpoint(),
            average: this.average.checkpoint(),
        });
    }

    protected restoreState(state: AverageDirectionalIndexCheckpoint): void {
        this.directional.restore(state);
        this.average.restore(state.average);
    }
}

export class DirectionalIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    DirectionalMovementCheckpoint
> {
    private readonly directional: DirectionalMovementKernel;

    constructor(readonly length: number) {
        super(['plusDI', 'minusDI', 'dx']);
        resolvedLength({ length }, length, 1, 500);
        this.directional = new DirectionalMovementKernel(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const { plusDI, minusDI, dx } = this.directional.process(input, commit);
        const formed = input.index >= this.length + 1 && dx !== null;
        return {
            isFormed: formed,
            values: [
                this.output('plusDI', formed ? plusDI : null, input.index),
                this.output('minusDI', formed ? minusDI : null, input.index),
                this.output('dx', formed ? dx : null, input.index),
            ],
        };
    }

    protected resetState(): void { this.directional.reset(); }
    protected captureState(): DirectionalMovementCheckpoint {
        return this.directional.checkpoint();
    }
    protected restoreState(state: DirectionalMovementCheckpoint): void {
        this.directional.restore(state);
    }
}

export interface CommodityChannelIndexCheckpoint {
    readonly typicalPrices: RingBufferCheckpoint<number | null>;
}

export class CommodityChannelIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    CommodityChannelIndexCheckpoint
> {
    private readonly index: CommodityChannelIndexKernel;

    constructor(readonly length: number) {
        super(['line']);
        resolvedLength({ length }, length, 1, 500);
        this.index = new CommodityChannelIndexKernel(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const typical = high === null || low === null || close === null
            ? null
            : (high + low + close) / 3;
        const value = commit ? this.index.push(typical) : this.index.preview(typical);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.index.reset(); }

    protected captureState(): CommodityChannelIndexCheckpoint {
        return Object.freeze({ typicalPrices: this.index.checkpoint() });
    }

    protected restoreState(state: CommodityChannelIndexCheckpoint): void {
        this.index.restore(state?.typicalPrices);
    }
}

export class FractalDimensionProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    FractalDimensionCheckpoint
> {
    private readonly values: RingBuffer<number>;
    private readonly maximum: RollingMaximum;
    private readonly minimum: RollingMinimum;
    private readonly logDenominator: number | null;
    private pathLength = 0;

    constructor(readonly length: number) {
        super(['line']);
        resolvedLength({ length }, length, 1, 500);
        this.values = new RingBuffer<number>(length);
        this.maximum = new RollingMaximum(length);
        this.minimum = new RollingMinimum(length);
        this.logDenominator = length > 1 ? Math.log(2 * (length - 1)) : null;
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

        const pathLength = this.projectPath(close);
        const maximum = commit ? this.maximum.push(close) : this.maximum.preview(close);
        const minimum = commit ? this.minimum.push(close) : this.minimum.preview(close);
        if (commit) {
            this.values.push(close);
            this.pathLength = pathLength;
        }

        let value: number | null = null;
        if (maximum !== null && minimum !== null) {
            const range = maximum - minimum;
            let dimension = pathLength === 0 || range === 0 || this.logDenominator === null
                ? 1.5
                : 1 + (Math.log(pathLength) - Math.log(range)) / this.logDenominator;
            dimension = Math.max(1, Math.min(2, dimension));
            value = finite(dimension);
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.values.clear();
        this.maximum.reset();
        this.minimum.reset();
        this.pathLength = 0;
    }

    protected captureState(): FractalDimensionCheckpoint {
        return Object.freeze({ values: this.values.checkpoint() });
    }

    protected restoreState(state: FractalDimensionCheckpoint): void {
        const values = state?.values?.values;
        if (!Array.isArray(values) || values.length > this.length
            || values.some((value) => finite(value) === null)) {
            throw new TypeError('sschart: invalid Fractal Dimension checkpoint');
        }
        this.resetState();
        for (const value of values) this.append(value);
    }

    private projectPath(value: number): number {
        if (this.values.size === 0 || this.length === 1) return 0;
        let path = this.pathLength + Math.abs(value - this.values.back()!);
        if (this.values.full) {
            path -= Math.abs(this.values.at(1)! - this.values.front()!);
        }
        return Math.max(0, path);
    }

    private append(value: number): void {
        this.pathLength = this.projectPath(value);
        this.maximum.push(value);
        this.minimum.push(value);
        this.values.push(value);
    }
}

export class HurstExponentProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    HurstExponentCheckpoint
> {
    private readonly values: RingBuffer<number | null>;
    private readonly logLength: number | null;
    private sum = 0;
    private invalid = 0;

    constructor(readonly length: number) {
        super(['line']);
        resolvedLength({ length }, length, 1, 1_000);
        this.values = new RingBuffer<number | null>(length);
        this.logLength = length > 1 ? Math.log(length) : null;
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const evaluation = this.evaluate(close);
        let value: number | null = null;
        if (evaluation.size === this.length && evaluation.invalid === 0
            && this.logLength !== null) {
            const mean = evaluation.sum / this.length;
            let cumulative = 0;
            let maximum = -Infinity;
            let minimum = Infinity;
            let squared = 0;
            for (let index = 0; index < this.length; index += 1) {
                const item = this.projectedValue(index, close)!;
                const deviation = item - mean;
                cumulative += deviation;
                maximum = Math.max(maximum, cumulative);
                minimum = Math.min(minimum, cumulative);
                squared += deviation * deviation;
            }
            const deviation = Math.sqrt(squared / this.length);
            if (deviation !== 0) {
                const rescaledRange = (maximum - minimum) / deviation;
                value = finite(Math.log(rescaledRange) / this.logLength);
            }
        }
        if (commit) {
            this.values.push(close);
            this.sum = evaluation.sum;
            this.invalid = evaluation.invalid;
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.values.clear();
        this.sum = 0;
        this.invalid = 0;
    }

    protected captureState(): HurstExponentCheckpoint {
        return Object.freeze({ values: this.values.checkpoint() });
    }

    protected restoreState(state: HurstExponentCheckpoint): void {
        const values = state?.values?.values;
        if (!Array.isArray(values) || values.length > this.length
            || values.some((value) => value !== null && finite(value) === null)) {
            throw new TypeError('sschart: invalid Hurst Exponent checkpoint');
        }
        this.resetState();
        for (const value of values) this.append(value);
    }

    private evaluate(incoming: number | null): HurstWindowEvaluation {
        const outgoing = this.values.full ? (this.values.front() ?? null) : null;
        return {
            size: Math.min(this.length, this.values.size + 1),
            sum: this.sum
                - (this.values.full ? (outgoing ?? 0) : 0)
                + (incoming ?? 0),
            invalid: this.invalid
                - (this.values.full && outgoing === null ? 1 : 0)
                + (incoming === null ? 1 : 0),
        };
    }

    private projectedValue(index: number, incoming: number | null): number | null | undefined {
        if (this.values.full) {
            return index === this.length - 1 ? incoming : this.values.at(index + 1);
        }
        return index === this.values.size ? incoming : this.values.at(index);
    }

    private append(value: number | null): void {
        const evaluation = this.evaluate(value);
        this.values.push(value);
        this.sum = evaluation.sum;
        this.invalid = evaluation.invalid;
    }
}

interface MarketMeannessEvaluation {
    readonly priceChanges: number;
    readonly directionChanges: number;
    readonly previousDirection: -1 | 0 | 1;
    readonly size: number;
    readonly value: number | null;
}

export class MarketMeannessIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    MarketMeannessIndexCheckpoint
> {
    private readonly values: RingBuffer<number>;
    private priceChanges = 0;
    private directionChanges = 0;
    private previousDirection: -1 | 0 | 1 = 0;

    constructor(readonly length: number) {
        super(['line']);
        resolvedLength({ length }, length, 1, 2_000);
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

        const evaluation = this.evaluate(price);
        if (commit) {
            this.values.push(price);
            this.priceChanges = evaluation.priceChanges;
            this.directionChanges = evaluation.directionChanges;
            this.previousDirection = evaluation.previousDirection;
        }
        return {
            isFormed: evaluation.value !== null,
            values: [this.output('line', evaluation.value, input.index)],
        };
    }

    protected resetState(): void {
        this.values.clear();
        this.priceChanges = 0;
        this.directionChanges = 0;
        this.previousDirection = 0;
    }

    protected captureState(): MarketMeannessIndexCheckpoint {
        return Object.freeze({
            values: this.values.checkpoint(),
            priceChanges: this.priceChanges,
            directionChanges: this.directionChanges,
            previousDirection: this.previousDirection,
        });
    }

    protected restoreState(state: MarketMeannessIndexCheckpoint): void {
        const values = state?.values?.values;
        if (state === null || typeof state !== 'object'
            || !Array.isArray(values) || values.length > this.length
            || values.some((value) => finite(value) === null)
            || !Number.isInteger(state.priceChanges) || state.priceChanges < 0
            || !Number.isInteger(state.directionChanges)
            || ![-1, 0, 1].includes(state.previousDirection)) {
            throw new TypeError('sschart: invalid Market Meanness Index checkpoint');
        }
        this.values.restore(state.values);
        this.priceChanges = state.priceChanges;
        this.directionChanges = state.directionChanges;
        this.previousDirection = state.previousDirection;
    }

    private evaluate(price: number): MarketMeannessEvaluation {
        let priceChanges = this.priceChanges;
        let directionChanges = this.directionChanges;
        let previousDirection = this.previousDirection;
        const retainedSize = this.values.size - (this.values.full ? 1 : 0);

        if (this.values.full) {
            const oldest = this.values.front() as number;
            const next = this.values.at(1);
            const removedDirection = next === undefined ? 0 : this.sign(next - oldest);
            if (removedDirection !== 0) priceChanges -= 1;
            if (removedDirection !== previousDirection && previousDirection !== 0)
                directionChanges -= 1;
        }

        if (retainedSize > 0) {
            const addedDirection = this.sign(price - (this.values.back() as number));
            if (addedDirection !== 0) priceChanges += 1;
            if (addedDirection !== previousDirection && previousDirection !== 0)
                directionChanges += 1;
            previousDirection = addedDirection;
        }

        const size = Math.min(this.length, this.values.size + 1);
        const candidate = size === this.length
            ? (priceChanges > 0 ? 100 * directionChanges / priceChanges : 0)
            : null;
        return {
            priceChanges,
            directionChanges,
            previousDirection,
            size,
            value: finite(candidate),
        };
    }

    private sign(value: number): -1 | 0 | 1 {
        return value > 0 ? 1 : (value < 0 ? -1 : 0);
    }
}

export const AverageDirectionalIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    RecursiveLengthParameters
> = registerIndicator({
    id: 'AverageDirectionalIndex',
    name: 'ADX',
    description: 'Wilder directional movement index with positive, negative and ADX lines.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14, 2, 100)],
    outputs: [
        { id: 'plusDI', name: '+DI', defaultStyle: lineStyle('#42a5f5', 1) },
        { id: 'minusDI', name: '-DI', defaultStyle: lineStyle('#ff7043', 1) },
        { id: 'adx', name: 'ADX', defaultStyle: lineStyle('#ab47bc') },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new AverageDirectionalIndexProcessor(
        resolvedLength(parameters, 14, 2, 100),
    ),
});

export const DirectionalIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    RecursiveLengthParameters
> = registerIndicator({
    id: 'DirectionalIndex',
    name: 'Directional Index',
    description: 'Positive and negative directional movement with their unsmoothed DX.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(14, 1, 500)],
    outputs: [
        { id: 'plusDI', name: '+DI', defaultStyle: lineStyle('#42a5f5', 1) },
        { id: 'minusDI', name: '-DI', defaultStyle: lineStyle('#ff7043', 1) },
        { id: 'dx', name: 'DX', defaultStyle: lineStyle('#ab47bc') },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new DirectionalIndexProcessor(
        resolvedLength(parameters, 14, 1, 500),
    ),
});

export const CommodityChannelIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    RecursiveLengthParameters
> = registerIndicator({
    id: 'CommodityChannelIndex',
    name: 'Commodity Channel Index',
    description: 'Typical-price deviation from its rolling mean.',
    category: IndicatorCategory.Statistical,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(20, 1, 500)],
    outputs: [{ id: 'line', name: 'CCI', defaultStyle: lineStyle('#26c6da') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: (parameters) => new CommodityChannelIndexProcessor(
        resolvedLength(parameters, 20, 1, 500),
    ),
});

export const FractalDimensionIndicator: IndicatorDefinition<
    IndicatorCandle,
    RecursiveLengthParameters
> = registerIndicator({
    id: 'FractalDimension',
    name: 'Fractal Dimension',
    description: 'Clamped fractal dimension of the rolling close-price path.',
    category: IndicatorCategory.Statistical,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(30, 1, 500)],
    outputs: [{ id: 'line', name: 'Fractal Dimension', defaultStyle: lineStyle('#7e57c2') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: (parameters) => new FractalDimensionProcessor(
        resolvedLength(parameters, 30, 1, 500),
    ),
});

export const HurstExponentIndicator: IndicatorDefinition<
    IndicatorCandle,
    RecursiveLengthParameters
> = registerIndicator({
    id: 'HurstExponent',
    name: 'Hurst Exponent',
    description: 'Rescaled-range estimate over a fixed rolling close-price window.',
    category: IndicatorCategory.Statistical,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(100, 1, 1_000)],
    outputs: [{ id: 'line', name: 'Hurst Exponent', defaultStyle: lineStyle('#26a69a') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new HurstExponentProcessor(
        resolvedLength(parameters, 100, 1, 1_000),
    ),
});

export const MarketMeannessIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    RecursiveLengthParameters
> = registerIndicator({
    id: 'MarketMeannessIndex',
    name: 'Market Meanness Index',
    description: 'Percentage of close-price direction changes in a rolling window.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [lengthParameter(200, 1, 2_000)],
    outputs: [{ id: 'line', name: 'MMI', defaultStyle: lineStyle('#ffca28') }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new MarketMeannessIndexProcessor(
        resolvedLength(parameters, 200, 1, 2_000),
    ),
});

export const RecursiveStatisticalIndicators = Object.freeze([
    AverageDirectionalIndexIndicator,
    DirectionalIndexIndicator,
    CommodityChannelIndexIndicator,
    FractalDimensionIndicator,
    HurstExponentIndicator,
    MarketMeannessIndexIndicator,
] as const);
