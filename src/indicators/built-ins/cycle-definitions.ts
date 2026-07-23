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
    LinearWeightedMovingAverage,
    RingBuffer,
    RollingMaximum,
    RollingMinimum,
    RollingSum,
    SimpleMovingAverage,
    lunarPhaseFromMilliseconds,
    type RingBufferCheckpoint,
    type RollingWindowCheckpoint,
} from '../math/index.js';

export interface CycleLengthParameters extends IndicatorParameters {
    readonly length: number;
}

export interface CenterOfGravityCheckpoint {
    readonly sum: RollingWindowCheckpoint;
    readonly weighted: RollingWindowCheckpoint;
}

export interface DetrendedPriceOscillatorCheckpoint {
    readonly average: RollingWindowCheckpoint;
    readonly history: RingBufferCheckpoint<number | null>;
}

export interface EhlersFisherTransformCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
    readonly previousValue: number;
    readonly previousFisher: number;
}

export interface HarmonicOscillatorCheckpoint {
    readonly values: RingBufferCheckpoint<number | null>;
}

interface HarmonicEvaluation {
    readonly size: number;
    readonly sine: number;
    readonly cosine: number;
    readonly invalid: number;
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

export class CenterOfGravityOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    CenterOfGravityCheckpoint
> {
    private readonly sum: RollingSum;
    private readonly weighted: LinearWeightedMovingAverage;
    private readonly divisor: number;
    private readonly center: number;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1)
            throw new RangeError('sschart: COG length must be a positive integer');
        this.sum = new RollingSum(length);
        this.weighted = new LinearWeightedMovingAverage(length);
        this.divisor = length * (length + 1) / 2;
        this.center = (length + 1) / 2;
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const sum = commit ? this.sum.push(close) : this.sum.preview(close);
        const weightedAverage = commit
            ? this.weighted.push(close)
            : this.weighted.preview(close);
        const candidate = sum !== null && sum !== 0 && weightedAverage !== null
            ? weightedAverage * this.divisor / sum - this.center
            : null;
        const value = finite(candidate);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.sum.reset();
        this.weighted.reset();
    }

    protected captureState(): CenterOfGravityCheckpoint {
        return Object.freeze({
            sum: this.sum.checkpoint(),
            weighted: this.weighted.checkpoint(),
        });
    }

    protected restoreState(state: CenterOfGravityCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || state.sum?.values?.length !== state.weighted?.values?.length) {
            throw new TypeError('sschart: invalid Center Of Gravity checkpoint');
        }
        this.sum.restore(state.sum);
        this.weighted.restore(state.weighted);
    }
}

export class DetrendedPriceOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    DetrendedPriceOscillatorCheckpoint
> {
    private readonly average: SimpleMovingAverage;
    private readonly history: RingBuffer<number | null>;
    private readonly lookBack: number;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1)
            throw new RangeError('sschart: DPO length must be a positive integer');
        this.average = new SimpleMovingAverage(length);
        this.history = new RingBuffer(length);
        this.lookBack = Math.floor(length / 2) + 1;
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const average = commit ? this.average.push(close) : this.average.preview(close);
        const target = input.index - this.lookBack;
        const reference = this.history.size < this.lookBack
            ? undefined
            : this.history.at(this.history.size - this.lookBack);
        const candidate = input.index >= 2 * this.length - 2
            && target >= 0 && close !== null && typeof reference === 'number'
            ? close - reference
            : null;
        const value = finite(candidate);
        if (commit && input.index >= this.length - 1) this.history.push(average);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.average.reset();
        this.history.clear();
    }

    protected captureState(): DetrendedPriceOscillatorCheckpoint {
        return Object.freeze({
            average: this.average.checkpoint(),
            history: this.history.checkpoint(),
        });
    }

    protected restoreState(state: DetrendedPriceOscillatorCheckpoint): void {
        const values = state?.history?.values;
        if (state === null || typeof state !== 'object'
            || !Array.isArray(values) || values.length > this.length
            || values.some((value) => value !== null && finite(value) === null)) {
            throw new TypeError('sschart: invalid DPO checkpoint');
        }
        this.average.restore(state.average);
        this.history.restore(state.history);
    }
}

export class EhlersFisherTransformProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    EhlersFisherTransformCheckpoint
> {
    private readonly high: RollingMaximum;
    private readonly low: RollingMinimum;
    private previousValue = 0;
    private previousFisher = 0;

    constructor(readonly length: number) {
        super(['main', 'trigger']);
        if (!Number.isInteger(length) || length < 1)
            throw new RangeError('sschart: Ehlers Fisher length must be a positive integer');
        this.high = new RollingMaximum(length);
        this.low = new RollingMinimum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const currentHigh = finite(input.value?.high);
        const currentLow = finite(input.value?.low);
        const high = commit ? this.high.push(currentHigh) : this.high.preview(currentHigh);
        const low = commit ? this.low.push(currentLow) : this.low.preview(currentLow);
        let main: number | null = null;
        let trigger: number | null = null;
        let nextValue = this.previousValue;
        if (high !== null && low !== null && currentHigh !== null && currentLow !== null) {
            const range = high - low;
            const median = (currentHigh + currentLow) / 2;
            const base = range === 0 ? 0 : 0.5 * ((median - low) / range - 0.5);
            nextValue = Math.max(-0.999, Math.min(0.999, 0.66 * base + 0.67 * this.previousValue));
            main = finite(0.5 * Math.log((1 + nextValue) / (1 - nextValue)));
            if (main !== null) trigger = this.previousFisher;
        }
        if (commit && main !== null) {
            this.previousValue = nextValue;
            this.previousFisher = main;
        }
        return {
            isFormed: main !== null,
            values: [
                this.output('main', main, input.index),
                this.output('trigger', trigger, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.high.reset();
        this.low.reset();
        this.previousValue = 0;
        this.previousFisher = 0;
    }

    protected captureState(): EhlersFisherTransformCheckpoint {
        return Object.freeze({
            high: this.high.checkpoint(),
            low: this.low.checkpoint(),
            previousValue: this.previousValue,
            previousFisher: this.previousFisher,
        });
    }

    protected restoreState(state: EhlersFisherTransformCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || state.high?.values?.length !== state.low?.values?.length
            || finite(state.previousValue) === null || finite(state.previousFisher) === null) {
            throw new TypeError('sschart: invalid Ehlers Fisher checkpoint');
        }
        this.high.restore(state.high);
        this.low.restore(state.low);
        this.previousValue = state.previousValue;
        this.previousFisher = state.previousFisher;
    }
}

export class HarmonicOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    HarmonicOscillatorCheckpoint
> {
    private readonly values: RingBuffer<number | null>;
    private readonly sineStep: number;
    private readonly cosineStep: number;
    private sine = 0;
    private cosine = 0;
    private invalid = 0;

    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Harmonic Oscillator length must be an integer from 1 to 500',
            );
        }
        this.values = new RingBuffer<number | null>(length);
        const angle = 2 * Math.PI / length;
        this.sineStep = Math.sin(angle);
        this.cosineStep = Math.cos(angle);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const incoming = finite(input.value?.close);
        const evaluation = this.evaluate(incoming);
        if (commit) {
            this.values.push(incoming);
            this.sine = evaluation.sine;
            this.cosine = evaluation.cosine;
            this.invalid = evaluation.invalid;
        }
        const candidate = evaluation.size === this.length && evaluation.invalid === 0
            ? evaluation.sine / this.length
            : null;
        const value = finite(candidate);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.values.clear();
        this.sine = 0;
        this.cosine = 0;
        this.invalid = 0;
    }

    protected captureState(): HarmonicOscillatorCheckpoint {
        return Object.freeze({ values: this.values.checkpoint() });
    }

    protected restoreState(state: HarmonicOscillatorCheckpoint): void {
        const values = state?.values?.values;
        if (!Array.isArray(values) || values.length > this.length
            || values.some((value) => value !== null && finite(value) === null)) {
            throw new TypeError('sschart: invalid Harmonic Oscillator checkpoint');
        }
        this.resetState();
        for (const value of values) this.append(value);
    }

    private evaluate(incoming: number | null): HarmonicEvaluation {
        const outgoing = this.values.full ? (this.values.front() ?? null) : null;
        const size = Math.min(this.length, this.values.size + 1);
        const invalid = this.invalid
            - (this.values.full && outgoing === null ? 1 : 0)
            + (incoming === null ? 1 : 0);
        if (this.length === 1) {
            return { size, sine: 0, cosine: incoming ?? 0, invalid };
        }
        const sine = this.sine * this.cosineStep + this.cosine * this.sineStep;
        const cosine = this.cosine * this.cosineStep - this.sine * this.sineStep
            - (this.values.full ? (outgoing ?? 0) : 0)
            + (incoming ?? 0);
        return { size, sine, cosine, invalid };
    }

    private append(value: number | null): void {
        const evaluation = this.evaluate(value);
        this.values.push(value);
        this.sine = evaluation.sine;
        this.cosine = evaluation.cosine;
        this.invalid = evaluation.invalid;
    }
}

export class LunarPhaseProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor() {
        super(['line']);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        _commit: boolean,
    ): IndicatorCalculationResult {
        const value = lunarPhaseFromMilliseconds(input.time * 1_000);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { /* stateless */ }

    protected captureState(): null { return null; }

    protected restoreState(state: null): void {
        if (state !== null)
            throw new TypeError('sschart: invalid Lunar Phase checkpoint');
    }
}

export class SineWaveProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    private readonly step: number;

    constructor(readonly length: number) {
        super(['sine', 'leadsine']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Sine Wave length must be an integer from 1 to 500',
            );
        }
        this.step = 2 * Math.PI / length;
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        _commit: boolean,
    ): IndicatorCalculationResult {
        const sine = Math.sin(this.step * input.index);
        const leadSine = Math.sin(this.step * (input.index + 0.5));
        return {
            isFormed: input.index >= this.length,
            values: [
                this.output('sine', sine, input.index),
                this.output('leadsine', leadSine, input.index),
            ],
        };
    }

    protected resetState(): void { /* phase is derived from the sequential position */ }
    protected captureState(): null { return null; }
    protected restoreState(state: null): void {
        if (state !== null) throw new TypeError('sschart: invalid Sine Wave checkpoint');
    }
}

export const CenterOfGravityOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    CycleLengthParameters
> = registerIndicator({
    id: 'CenterOfGravityOscillator',
    name: 'Center Of Gravity Oscillator',
    description: 'Price center of gravity over a linearly weighted rolling window.',
    category: IndicatorCategory.Cycle,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 10, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Center Of Gravity',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#42a5f5',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new CenterOfGravityOscillatorProcessor(
        length(parameters?.length, 10),
    ),
});

export const DetrendedPriceOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    CycleLengthParameters
> = registerIndicator({
    id: 'DetrendedPriceOscillator',
    name: 'Detrended Price Oscillator',
    description: 'Current close minus a delayed simple moving average.',
    category: IndicatorCategory.Cycle,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 3, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'DPO',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#ffb74d',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new DetrendedPriceOscillatorProcessor(
        length(parameters?.length, 3),
    ),
});

export const EhlersFisherTransformIndicator: IndicatorDefinition<
    IndicatorCandle,
    CycleLengthParameters
> = registerIndicator({
    id: 'EhlersFisherTransform',
    name: 'Ehlers Fisher Transform',
    description: 'Fisher transform of normalized median price with a lagged trigger.',
    category: IndicatorCategory.Cycle,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 10, min: 1, max: 500, step: 1,
    }],
    outputs: [
        {
            id: 'main', name: 'Fisher',
            defaultStyle: {
                series: IndicatorSeriesStyle.Line,
                color: '#42a5f5', lineWidth: 2,
                options: { priceLineVisible: false },
            },
        },
        {
            id: 'trigger', name: 'Trigger',
            defaultStyle: {
                series: IndicatorSeriesStyle.Line,
                color: '#ff7043', lineWidth: 1,
                options: { priceLineVisible: false },
            },
        },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new EhlersFisherTransformProcessor(
        length(parameters?.length, 10),
    ),
});

export const HarmonicOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    CycleLengthParameters
> = registerIndicator({
    id: 'HarmonicOscillator',
    name: 'Harmonic Oscillator',
    description: 'Sine-weighted average of closing prices over a fixed cycle.',
    category: IndicatorCategory.Cycle,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 14, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'Harmonic Oscillator',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#ab47bc',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new HarmonicOscillatorProcessor(
        length(parameters?.length, 14),
    ),
});

export const LunarPhaseIndicator: IndicatorDefinition<IndicatorCandle> = registerIndicator({
    id: 'LunarPhase',
    name: 'Lunar Phase',
    description: 'Eight-part lunar cycle phase derived from each candle timestamp.',
    category: IndicatorCategory.Cycle,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{
        id: 'line',
        name: 'Lunar Phase',
        defaultStyle: {
            series: IndicatorSeriesStyle.Line,
            color: '#7e57c2',
            lineWidth: 2,
            options: { priceLineVisible: false },
        },
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: () => new LunarPhaseProcessor(),
});

export const SineWaveIndicator: IndicatorDefinition<
    IndicatorCandle,
    CycleLengthParameters
> = registerIndicator({
    id: 'SineWave',
    name: 'Sine Wave',
    description: 'Synthetic main and half-bar-leading sine waves driven by bar position.',
    category: IndicatorCategory.Cycle,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 14, min: 1, max: 500, step: 1,
    }],
    outputs: [
        {
            id: 'sine', name: 'Sine',
            defaultStyle: {
                series: IndicatorSeriesStyle.Line,
                color: '#42a5f5',
                lineWidth: 2,
                options: { priceLineVisible: false },
            },
        },
        {
            id: 'leadsine', name: 'Lead Sine',
            defaultStyle: {
                series: IndicatorSeriesStyle.Line,
                color: '#ff7043',
                lineWidth: 1,
                options: { priceLineVisible: false },
            },
        },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new SineWaveProcessor(
        length(parameters?.length, 14),
    ),
});

export const CycleIndicators = Object.freeze([
    CenterOfGravityOscillatorIndicator,
    DetrendedPriceOscillatorIndicator,
    EhlersFisherTransformIndicator,
    HarmonicOscillatorIndicator,
    LunarPhaseIndicator,
    SineWaveIndicator,
] as const);
