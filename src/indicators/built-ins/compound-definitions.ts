import {
    CandlestickIndicatorInput,
    IndicatorCategory,
    IndicatorMeasure,
    IndicatorPane,
    IndicatorParameterType,
    IndicatorSeriesStyle,
    type IndicatorCandle,
    type IndicatorDefinition,
    type IndicatorOutputDefinition,
    type IndicatorParameters,
    type IndicatorProcessInput,
} from '../indicator-definition.js';
import { registerIndicator } from '../indicator-registry.js';
import {
    SequentialIndicatorProcessor,
    type IndicatorCalculationResult,
} from '../sequential-processor.js';
import {
    ExpandingAverageTrueRange,
    ExponentialMovingAverage,
    LinearWeightedMovingAverage,
    PartialRelativeStrengthIndex,
    PartialSeedExponentialMovingAverage,
    PartialSeedSimpleMovingAverage,
    RingBuffer,
    RollingMaximum,
    RollingMinimum,
    RollingStandardDeviation,
    SimpleMovingAverage,
    type RollingWindowCheckpoint,
    type ExpandingAverageTrueRangeCheckpoint,
    type PartialRelativeStrengthIndexCheckpoint,
    type PartialSeedExponentialMovingAverageCheckpoint,
    type RingBufferCheckpoint,
    type SeededMovingAverageCheckpoint,
} from '../math/index.js';
import { CommodityChannelIndexKernel } from '../math/commodity-channel-index.js';

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number, name: string): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || (resolved as number) < minimum || (resolved as number) > maximum) {
        throw new RangeError(
            `sschart: indicator ${name} must be an integer from ${minimum} to ${maximum}`,
        );
    }
    return resolved as number;
}

function number(value: unknown, fallback: number, minimum: number, maximum: number, name: string): number {
    const resolved = value ?? fallback;
    if (typeof resolved !== 'number' || !Number.isFinite(resolved)
        || resolved < minimum || resolved > maximum) {
        throw new RangeError(
            `sschart: indicator ${name} must be finite from ${minimum} to ${maximum}`,
        );
    }
    return resolved;
}

function style(series: IndicatorSeriesStyle, color: string, lineWidth = 1) {
    return {
        series,
        color,
        lineWidth,
        options: { priceLineVisible: false },
    } as const;
}

export interface BollingerBandsParameters extends IndicatorParameters {
    readonly length: number;
    readonly stdDev: number;
}

export interface BollingerPercentBParameters extends IndicatorParameters {
    readonly length: number;
    readonly stdDevMultiplier: number;
}

export interface KeltnerChannelsParameters extends IndicatorParameters {
    readonly length: number;
    readonly multiplier: number;
}

export interface KeltnerChannelsCheckpoint {
    readonly middle: PartialSeedExponentialMovingAverageCheckpoint;
    readonly averageTrueRange: ExpandingAverageTrueRangeCheckpoint;
}

export interface KasePeakOscillatorParameters extends IndicatorParameters {
    readonly atrLength: number;
    readonly shortPeriod: number;
    readonly longPeriod: number;
}

export interface KasePeakOscillatorCheckpoint {
    readonly averageTrueRange: ExpandingAverageTrueRangeCheckpoint;
    readonly peaks: RingBufferCheckpoint<number>;
    readonly valleys: RingBufferCheckpoint<number>;
    readonly previousClose: number;
}

export interface KnowSureThingParameters extends IndicatorParameters {
    readonly roc1Length: number;
    readonly roc2Length: number;
    readonly roc3Length: number;
    readonly roc4Length: number;
    readonly sma1Length: number;
    readonly sma2Length: number;
    readonly sma3Length: number;
    readonly sma4Length: number;
    readonly signalLength: number;
}

export interface KnowSureThingCheckpoint {
    readonly closes: RingBufferCheckpoint<number | null>;
    readonly averages: readonly RollingWindowCheckpoint[];
    readonly signal: RollingWindowCheckpoint;
}

export interface KlingerVolumeOscillatorParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
}

export interface KlingerVolumeOscillatorCheckpoint {
    readonly previousHlc: number;
    readonly short: FiniteExponentialCheckpoint;
    readonly long: FiniteExponentialCheckpoint;
}

export interface MovingAverageCrossoverParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
}

export interface MovingAverageCrossoverCheckpoint {
    readonly fast: RollingWindowCheckpoint;
    readonly slow: RollingWindowCheckpoint;
}

export interface MovingAverageRibbonParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
    readonly ribbonCount: number;
}

export interface MovingAverageRibbonCheckpoint {
    readonly averages: readonly RollingWindowCheckpoint[];
}

export interface RainbowChartsParameters extends IndicatorParameters {
    readonly lines: number;
}

export interface RainbowChartsCheckpoint {
    readonly averages: readonly RollingWindowCheckpoint[];
}

export interface McClellanOscillatorParameters extends IndicatorParameters {
    readonly shortLength: number;
    readonly longLength: number;
}

export interface McClellanOscillatorCheckpoint {
    readonly short: SeededMovingAverageCheckpoint;
    readonly long: SeededMovingAverageCheckpoint;
}

export interface RelativeVigorIndexParameters extends IndicatorParameters {
    readonly length: number;
    readonly signalLength: number;
}

export interface RelativeVigorSample {
    readonly numerator: number;
    readonly denominator: number;
}

export interface RelativeVigorIndexCheckpoint {
    readonly samples: RingBufferCheckpoint<RelativeVigorSample | null>;
    readonly values: RingBufferCheckpoint<number | null>;
}

const RIBBON_COLORS = Object.freeze([
    '#42a5f5', '#26c6da', '#26a69a', '#66bb6a', '#d4e157',
    '#ffca28', '#ffa726', '#ff7043', '#ef5350', '#ab47bc',
]);

function movingAverageRibbonLengths(
    shortPeriod: number,
    longPeriod: number,
    ribbonCount: number,
): readonly number[] {
    integer(shortPeriod, shortPeriod, 1, 500, 'shortPeriod');
    integer(longPeriod, longPeriod, 1, 1_000, 'longPeriod');
    integer(ribbonCount, ribbonCount, 2, 500, 'ribbonCount');
    const step = Math.trunc((longPeriod - shortPeriod) / (ribbonCount - 1));
    return Object.freeze(Array.from(
        { length: ribbonCount },
        (_, index) => shortPeriod + index * step,
    ));
}

function movingAverageRibbonOutputs(
    parameters: MovingAverageRibbonParameters,
): readonly IndicatorOutputDefinition[] {
    const shortPeriod = integer(parameters?.shortPeriod, 10, 1, 500, 'shortPeriod');
    const longPeriod = integer(parameters?.longPeriod, 100, 1, 1_000, 'longPeriod');
    const ribbonCount = integer(parameters?.ribbonCount, 10, 2, 500, 'ribbonCount');
    return movingAverageRibbonLengths(shortPeriod, longPeriod, ribbonCount).map((length, index) => ({
        id: `ribbon${index}`,
        name: `SMA ${length}`,
        defaultStyle: style(
            IndicatorSeriesStyle.Line,
            RIBBON_COLORS[index % RIBBON_COLORS.length],
            index === 0 ? 2 : 1,
        ),
    }));
}

const DEFAULT_MOVING_AVERAGE_RIBBON_OUTPUTS = movingAverageRibbonOutputs({
    shortPeriod: 10,
    longPeriod: 100,
    ribbonCount: 10,
});

function rainbowChartsOutputs(
    parameters: RainbowChartsParameters,
): readonly IndicatorOutputDefinition[] {
    const lines = integer(parameters?.lines, 10, 2, 500, 'lines');
    return Array.from({ length: lines - 1 }, (_, index) => {
        const line = index + 1;
        return {
            id: `sma${line}`,
            name: `SMA ${line * 2}`,
            defaultStyle: style(
                IndicatorSeriesStyle.Line,
                RIBBON_COLORS[index % RIBBON_COLORS.length],
                index === 0 ? 2 : 1,
            ),
        };
    });
}

const DEFAULT_RAINBOW_CHARTS_OUTPUTS = rainbowChartsOutputs({ lines: 10 });

export interface ConstanceBrownCompositeIndexParameters extends IndicatorParameters {
    readonly rsiLength: number;
    readonly rocLength: number;
    readonly shortRsiLength: number;
    readonly momentumLength: number;
    readonly fastSmaLength: number;
    readonly slowSmaLength: number;
}

export interface ConstanceBrownCompositeIndexCheckpoint {
    readonly rsi: PartialRelativeStrengthIndexCheckpoint;
    readonly shortRsi: PartialRelativeStrengthIndexCheckpoint;
    readonly rsiHistory: RingBufferCheckpoint<number | null>;
    readonly momentum: RingBufferCheckpoint<number>;
    readonly fastSma: RollingWindowCheckpoint;
    readonly slowSma: RollingWindowCheckpoint;
}

export interface CompositeMomentumParameters extends IndicatorParameters {
    readonly shortRocLength: number;
    readonly longRocLength: number;
    readonly rsiLength: number;
    readonly fastLength: number;
    readonly slowLength: number;
    readonly smaLength: number;
}

export interface CompositeMomentumCheckpoint {
    readonly shortRoc: RingBufferCheckpoint<number | null>;
    readonly longRoc: RingBufferCheckpoint<number | null>;
    readonly rsi: PartialRelativeStrengthIndexCheckpoint;
    readonly fast: FiniteExponentialCheckpoint;
    readonly slow: FiniteExponentialCheckpoint;
    readonly average: RollingWindowCheckpoint;
}

export interface ElderImpulseParameters extends IndicatorParameters {
    readonly emaLength: number;
    readonly fastLength: number;
    readonly slowLength: number;
}

export interface ElderImpulseCheckpoint {
    readonly ema: PartialSeedExponentialMovingAverageCheckpoint;
    readonly fast: PartialSeedExponentialMovingAverageCheckpoint;
    readonly slow: PartialSeedExponentialMovingAverageCheckpoint;
    readonly previousEma: number | null;
    readonly previousMacd: number | null;
}

export interface BollingerBandsCheckpoint {
    readonly average: RollingWindowCheckpoint;
    readonly deviation: RollingWindowCheckpoint;
}

export interface PriceChannelsCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}

export interface DonchianChannelsCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}

export interface TrueStrengthIndexParameters extends IndicatorParameters {
    readonly firstLength: number;
    readonly secondLength: number;
    readonly signalLength: number;
}

export interface TrueStrengthIndexCheckpoint {
    readonly initialized: boolean;
    readonly previousClose: number | null;
    readonly firstMomentum: PartialSeedExponentialMovingAverageCheckpoint;
    readonly firstAbsoluteMomentum: PartialSeedExponentialMovingAverageCheckpoint;
    readonly doubleMomentum: PartialSeedExponentialMovingAverageCheckpoint;
    readonly doubleAbsoluteMomentum: PartialSeedExponentialMovingAverageCheckpoint;
    readonly signal: PartialSeedExponentialMovingAverageCheckpoint;
}

export interface WaveTrendOscillatorParameters extends IndicatorParameters {
    readonly esaPeriod: number;
    readonly dPeriod: number;
    readonly averagePeriod: number;
}

export interface WaveTrendOscillatorCheckpoint {
    readonly esa: SeededMovingAverageCheckpoint;
    readonly deviation: SeededMovingAverageCheckpoint;
    readonly average: RingBufferCheckpoint<number>;
}

export interface WoodiesCciParameters extends IndicatorParameters {
    readonly length: number;
    readonly smaLength: number;
}

export interface WoodiesCciCheckpoint {
    readonly cci: RingBufferCheckpoint<number | null>;
    readonly signal: RollingWindowCheckpoint;
}

export class PivotPointsProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    null
> {
    constructor() { super(['pp', 'r1', 'r2', 's1', 's2']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        _commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        if (high === null || low === null || close === null) {
            return {
                isFormed: false,
                values: [
                    this.output('pp', null, input.index),
                    this.output('r1', null, input.index),
                    this.output('r2', null, input.index),
                    this.output('s1', null, input.index),
                    this.output('s2', null, input.index),
                ],
            };
        }

        const pivot = (high + low + close) / 3;
        const range = high - low;
        return {
            isFormed: true,
            values: [
                this.output('pp', pivot, input.index),
                this.output('r1', 2 * pivot - low, input.index),
                this.output('r2', pivot + range, input.index),
                this.output('s1', 2 * pivot - high, input.index),
                this.output('s2', pivot - range, input.index),
            ],
        };
    }

    protected resetState(): void { /* stateless */ }
    protected captureState(): null { return null; }
    protected restoreState(state: null): void {
        if (state !== null) throw new TypeError('sschart: invalid Pivot Points checkpoint');
    }
}

export class RelativeVigorIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RelativeVigorIndexCheckpoint
> {
    private readonly samples = new RingBuffer<RelativeVigorSample | null>(4);
    private readonly values = new RingBuffer<number | null>(4);

    constructor(readonly length: number, readonly signalLength: number) {
        super(['rvi', 'signal']);
        integer(length, length, 4, 200, 'length');
        integer(signalLength, signalLength, 4, 100, 'signalLength');
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const open = finite(input.value?.open);
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const numerator = open === null || close === null ? null : finite(close - open);
        const denominator = high === null || low === null ? null : finite(high - low);
        const sample = numerator === null || denominator === null
            ? null
            : Object.freeze({ numerator, denominator });
        const rvi = input.index < this.length - 1 ? null : this.weightedSample(sample);
        const signal = input.index < this.length + this.signalLength - 2
            ? null
            : this.weightedValue(rvi);
        if (commit) {
            this.samples.push(sample);
            this.values.push(rvi);
        }
        return {
            isFormed: rvi !== null,
            values: [
                this.output('rvi', rvi, input.index),
                this.output('signal', signal, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.samples.clear();
        this.values.clear();
    }

    protected captureState(): RelativeVigorIndexCheckpoint {
        return Object.freeze({
            samples: this.samples.checkpoint(),
            values: this.values.checkpoint(),
        });
    }

    protected restoreState(state: RelativeVigorIndexCheckpoint): void {
        const samples = state?.samples?.values;
        const values = state?.values?.values;
        if (state === null || typeof state !== 'object'
            || !Array.isArray(samples) || samples.length > 4
            || samples.some((sample) => sample !== null && (
                typeof sample !== 'object'
                || finite(sample.numerator) === null || finite(sample.denominator) === null
            ))
            || !Array.isArray(values) || values.length > 4
            || values.some((value) => value !== null && finite(value) === null)) {
            throw new TypeError('sschart: invalid Relative Vigor Index checkpoint');
        }
        this.samples.restore(state.samples);
        this.values.restore(state.values);
    }

    private weightedSample(incoming: RelativeVigorSample | null): number | null {
        if (incoming === null || this.samples.size < 3) return null;
        const start = this.samples.size - 3;
        const first = this.samples.at(start);
        const second = this.samples.at(start + 1);
        const third = this.samples.at(start + 2);
        if (first === null || first === undefined
            || second === null || second === undefined
            || third === null || third === undefined) return null;
        const numerator = (first.numerator + 2 * second.numerator
            + 2 * third.numerator + incoming.numerator) / 6;
        const denominator = (first.denominator + 2 * second.denominator
            + 2 * third.denominator + incoming.denominator) / 6;
        return finite(denominator === 0 ? numerator : numerator / denominator);
    }

    private weightedValue(incoming: number | null): number | null {
        if (incoming === null || this.values.size < 3) return null;
        const start = this.values.size - 3;
        const first = this.values.at(start);
        const second = this.values.at(start + 1);
        const third = this.values.at(start + 2);
        if (first === null || first === undefined
            || second === null || second === undefined
            || third === null || third === undefined) return null;
        return finite((first + 2 * second + 2 * third + incoming) / 6);
    }
}

export class BollingerBandsProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    BollingerBandsCheckpoint
> {
    private readonly average: SimpleMovingAverage;
    private readonly deviation: RollingStandardDeviation;

    constructor(readonly length: number, readonly multiplier: number) {
        super(['upper', 'middle', 'lower']);
        this.average = new SimpleMovingAverage(length);
        this.deviation = new RollingStandardDeviation(length);
        number(multiplier, 2, 0, 100, 'stdDev');
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const middle = commit ? this.average.push(close) : this.average.preview(close);
        const deviation = commit ? this.deviation.push(close) : this.deviation.preview(close);
        const formed = middle !== null && deviation !== null;
        return {
            isFormed: formed,
            values: [
                this.output('upper', formed ? middle + this.multiplier * deviation : null, input.index),
                this.output('middle', formed ? middle : null, input.index),
                this.output('lower', formed ? middle - this.multiplier * deviation : null, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.average.reset();
        this.deviation.reset();
    }
    protected captureState(): BollingerBandsCheckpoint {
        return Object.freeze({
            average: this.average.checkpoint(),
            deviation: this.deviation.checkpoint(),
        });
    }
    protected restoreState(state: BollingerBandsCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || state.average?.values?.length !== state.deviation?.values?.length) {
            throw new TypeError('sschart: invalid Bollinger Bands checkpoint');
        }
        this.average.restore(state.average);
        this.deviation.restore(state.deviation);
    }
}

export class PriceChannelsProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    PriceChannelsCheckpoint
> {
    private readonly high: RollingMaximum;
    private readonly low: RollingMinimum;

    constructor(readonly length: number) {
        super(['upper', 'lower']);
        integer(length, length, 1, 500, 'length');
        this.high = new RollingMaximum(length);
        this.low = new RollingMinimum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const upper = commit
            ? this.high.push(finite(input.value?.high))
            : this.high.preview(finite(input.value?.high));
        const lower = commit
            ? this.low.push(finite(input.value?.low))
            : this.low.preview(finite(input.value?.low));
        const formed = upper !== null && lower !== null;
        return {
            isFormed: formed,
            values: [
                this.output('upper', formed ? upper : null, input.index),
                this.output('lower', formed ? lower : null, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.high.reset();
        this.low.reset();
    }

    protected captureState(): PriceChannelsCheckpoint {
        return Object.freeze({
            high: this.high.checkpoint(),
            low: this.low.checkpoint(),
        });
    }

    protected restoreState(state: PriceChannelsCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || state.high?.values?.length !== state.low?.values?.length) {
            throw new TypeError('sschart: invalid Price Channels checkpoint');
        }
        this.high.restore(state.high);
        this.low.restore(state.low);
    }
}

export class DonchianChannelsProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    DonchianChannelsCheckpoint
> {
    private readonly high: RollingMaximum;
    private readonly low: RollingMinimum;

    constructor(readonly length: number) {
        super(['upper', 'middle', 'lower']);
        integer(length, length, 1, 500, 'length');
        this.high = new RollingMaximum(length);
        this.low = new RollingMinimum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const upper = commit
            ? this.high.push(finite(input.value?.high))
            : this.high.preview(finite(input.value?.high));
        const lower = commit
            ? this.low.push(finite(input.value?.low))
            : this.low.preview(finite(input.value?.low));
        const formed = upper !== null && lower !== null;
        return {
            isFormed: formed,
            values: [
                this.output('upper', formed ? upper : null, input.index),
                this.output('middle', formed ? (upper + lower) / 2 : null, input.index),
                this.output('lower', formed ? lower : null, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.high.reset();
        this.low.reset();
    }

    protected captureState(): DonchianChannelsCheckpoint {
        return Object.freeze({ high: this.high.checkpoint(), low: this.low.checkpoint() });
    }

    protected restoreState(state: DonchianChannelsCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || state.high?.values?.length !== state.low?.values?.length) {
            throw new TypeError('sschart: invalid Donchian Channels checkpoint');
        }
        this.high.restore(state.high);
        this.low.restore(state.low);
    }
}

export class DetrendedSyntheticPriceProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    DonchianChannelsCheckpoint
> {
    private readonly high: RollingMaximum;
    private readonly low: RollingMinimum;

    constructor(readonly length: number) {
        super(['line']);
        integer(length, length, 1, 500, 'length');
        this.high = new RollingMaximum(length);
        this.low = new RollingMinimum(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const highest = commit ? this.high.push(high) : this.high.preview(high);
        const lowest = commit ? this.low.push(low) : this.low.preview(low);
        const value = highest === null || lowest === null ? null : (highest + lowest) / 2;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.high.reset();
        this.low.reset();
    }

    protected captureState(): DonchianChannelsCheckpoint {
        return Object.freeze({ high: this.high.checkpoint(), low: this.low.checkpoint() });
    }

    protected restoreState(state: DonchianChannelsCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || state.high?.values?.length !== state.low?.values?.length) {
            throw new TypeError('sschart: invalid Detrended Synthetic Price checkpoint');
        }
        this.high.restore(state.high);
        this.low.restore(state.low);
    }
}

export class TrueStrengthIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    TrueStrengthIndexCheckpoint
> {
    private initialized = false;
    private previousClose: number | null = null;
    private readonly firstMomentum: PartialSeedExponentialMovingAverage;
    private readonly firstAbsoluteMomentum: PartialSeedExponentialMovingAverage;
    private readonly doubleMomentum: PartialSeedExponentialMovingAverage;
    private readonly doubleAbsoluteMomentum: PartialSeedExponentialMovingAverage;
    private readonly signal: PartialSeedExponentialMovingAverage;

    constructor(
        readonly firstLength: number,
        readonly secondLength: number,
        readonly signalLength: number,
    ) {
        super(['tsi', 'signal']);
        integer(firstLength, firstLength, 1, 500, 'firstLength');
        integer(secondLength, secondLength, 1, 500, 'secondLength');
        integer(signalLength, signalLength, 1, 500, 'signalLength');
        this.firstMomentum = new PartialSeedExponentialMovingAverage(firstLength);
        this.firstAbsoluteMomentum = new PartialSeedExponentialMovingAverage(firstLength);
        this.doubleMomentum = new PartialSeedExponentialMovingAverage(secondLength);
        this.doubleAbsoluteMomentum = new PartialSeedExponentialMovingAverage(secondLength);
        this.signal = new PartialSeedExponentialMovingAverage(signalLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const currentClose = finite(input.value?.close);
        if (!this.initialized) {
            if (commit) {
                this.initialized = true;
                this.previousClose = currentClose;
            }
            return {
                isFormed: false,
                values: [
                    this.output('tsi', null, input.index),
                    this.output('signal', null, input.index),
                ],
            };
        }

        const momentum = currentClose === null || this.previousClose === null
            ? null
            : currentClose - this.previousClose;
        const absoluteMomentum = momentum === null ? null : Math.abs(momentum);
        const firstMomentum = commit
            ? this.firstMomentum.push(momentum)
            : this.firstMomentum.preview(momentum);
        const firstAbsoluteMomentum = commit
            ? this.firstAbsoluteMomentum.push(absoluteMomentum)
            : this.firstAbsoluteMomentum.preview(absoluteMomentum);
        const doubleMomentum = commit
            ? this.doubleMomentum.push(firstMomentum)
            : this.doubleMomentum.preview(firstMomentum);
        const doubleAbsoluteMomentum = commit
            ? this.doubleAbsoluteMomentum.push(firstAbsoluteMomentum)
            : this.doubleAbsoluteMomentum.preview(firstAbsoluteMomentum);

        const rawTsi = doubleMomentum === null || doubleAbsoluteMomentum === null
            ? null
            : doubleAbsoluteMomentum === 0
                ? 0
                : finite(100 * doubleMomentum / doubleAbsoluteMomentum);
        const tsi = input.index >= this.secondLength ? rawTsi : null;
        const rawSignal = tsi === null
            ? null
            : commit ? this.signal.push(tsi) : this.signal.preview(tsi);
        const signal = input.index >= this.secondLength + this.signalLength - 1
            ? rawSignal
            : null;
        if (commit) this.previousClose = currentClose;
        return {
            isFormed: signal !== null,
            values: [
                this.output('tsi', tsi, input.index),
                this.output('signal', signal, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.initialized = false;
        this.previousClose = null;
        this.firstMomentum.reset();
        this.firstAbsoluteMomentum.reset();
        this.doubleMomentum.reset();
        this.doubleAbsoluteMomentum.reset();
        this.signal.reset();
    }

    protected captureState(): TrueStrengthIndexCheckpoint {
        return Object.freeze({
            initialized: this.initialized,
            previousClose: this.previousClose,
            firstMomentum: this.firstMomentum.checkpoint(),
            firstAbsoluteMomentum: this.firstAbsoluteMomentum.checkpoint(),
            doubleMomentum: this.doubleMomentum.checkpoint(),
            doubleAbsoluteMomentum: this.doubleAbsoluteMomentum.checkpoint(),
            signal: this.signal.checkpoint(),
        });
    }

    protected restoreState(state: TrueStrengthIndexCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || typeof state.initialized !== 'boolean'
            || (state.previousClose !== null && finite(state.previousClose) === null)
            || (!state.initialized && state.previousClose !== null)
            || state.firstMomentum?.count !== state.firstAbsoluteMomentum?.count
            || state.doubleMomentum?.count !== state.doubleAbsoluteMomentum?.count) {
            throw new TypeError('sschart: invalid True Strength Index checkpoint');
        }
        this.firstMomentum.restore(state.firstMomentum);
        this.firstAbsoluteMomentum.restore(state.firstAbsoluteMomentum);
        this.doubleMomentum.restore(state.doubleMomentum);
        this.doubleAbsoluteMomentum.restore(state.doubleAbsoluteMomentum);
        this.signal.restore(state.signal);
        this.initialized = state.initialized;
        this.previousClose = state.previousClose;
    }
}

export class WaveTrendOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    WaveTrendOscillatorCheckpoint
> {
    private readonly esa: ExponentialMovingAverage;
    private readonly deviation: ExponentialMovingAverage;
    private readonly average: PartialSeedSimpleMovingAverage;

    constructor(
        readonly esaPeriod: number,
        readonly dPeriod: number,
        readonly averagePeriod: number,
    ) {
        super(['wt1', 'wt2']);
        integer(esaPeriod, esaPeriod, 1, 500, 'esaPeriod');
        integer(dPeriod, dPeriod, 1, 500, 'dPeriod');
        integer(averagePeriod, averagePeriod, 1, 500, 'averagePeriod');
        this.esa = new ExponentialMovingAverage(esaPeriod);
        this.deviation = new ExponentialMovingAverage(dPeriod);
        this.average = new PartialSeedSimpleMovingAverage(averagePeriod);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        if (high === null || low === null || close === null) return this.empty(input.index);

        const typical = (high + low + close) / 3;
        const esa = commit ? this.esa.push(typical) : this.esa.preview(typical);
        if (esa === null) return this.empty(input.index);

        const difference = Math.abs(typical - esa);
        const deviation = commit
            ? this.deviation.push(difference)
            : this.deviation.preview(difference);
        if (deviation === null || deviation === 0) return this.empty(input.index);

        const wt1 = (typical - esa) / (0.015 * deviation);
        const wt2 = commit ? this.average.push(wt1) : this.average.preview(wt1);
        return {
            isFormed: wt2 !== null,
            values: [
                this.output('wt1', wt1, input.index),
                this.output('wt2', wt2, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.esa.reset();
        this.deviation.reset();
        this.average.reset();
    }

    protected captureState(): WaveTrendOscillatorCheckpoint {
        return Object.freeze({
            esa: this.esa.checkpoint(),
            deviation: this.deviation.checkpoint(),
            average: this.average.checkpoint(),
        });
    }

    protected restoreState(state: WaveTrendOscillatorCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.average?.values)
            || state.average.values.length > this.averagePeriod
            || state.average.values.some((value) => finite(value) === null)) {
            throw new TypeError('sschart: invalid Wave Trend Oscillator checkpoint');
        }
        this.esa.restore(state.esa);
        this.deviation.restore(state.deviation);
        this.average.restore(state.average);
    }

    private empty(index: number): IndicatorCalculationResult {
        return {
            isFormed: false,
            values: [
                this.output('wt1', null, index),
                this.output('wt2', null, index),
            ],
        };
    }
}

export class WoodiesCciProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    WoodiesCciCheckpoint
> {
    private readonly cci: CommodityChannelIndexKernel;
    private readonly signal: SimpleMovingAverage;

    constructor(readonly length: number, readonly smaLength: number) {
        super(['cci', 'signal']);
        integer(length, length, 1, 500, 'length');
        integer(smaLength, smaLength, 1, 500, 'smaLength');
        this.cci = new CommodityChannelIndexKernel(length);
        this.signal = new SimpleMovingAverage(smaLength);
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
        const cci = commit ? this.cci.push(typical) : this.cci.preview(typical);
        if (cci === null) {
            return {
                isFormed: false,
                values: [
                    this.output('cci', null, input.index),
                    this.output('signal', null, input.index),
                ],
            };
        }
        const signal = commit ? this.signal.push(cci) : this.signal.preview(cci);
        return {
            isFormed: signal !== null,
            values: [
                this.output('cci', cci, input.index),
                this.output('signal', signal, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.cci.reset();
        this.signal.reset();
    }

    protected captureState(): WoodiesCciCheckpoint {
        return Object.freeze({
            cci: this.cci.checkpoint(),
            signal: this.signal.checkpoint(),
        });
    }

    protected restoreState(state: WoodiesCciCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid Woodies CCI checkpoint');
        this.cci.restore(state.cci);
        this.signal.restore(state.signal);
    }
}

export class KeltnerChannelsProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    KeltnerChannelsCheckpoint
> {
    private readonly middle: PartialSeedExponentialMovingAverage;
    private readonly averageTrueRange: ExpandingAverageTrueRange;

    constructor(readonly length: number, readonly multiplier: number) {
        super(['upper', 'middle', 'lower']);
        integer(length, length, 1, 500, 'length');
        number(multiplier, multiplier, 0.000001, 500, 'multiplier');
        this.middle = new PartialSeedExponentialMovingAverage(length);
        this.averageTrueRange = new ExpandingAverageTrueRange(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const middle = commit ? this.middle.push(close) : this.middle.preview(close);
        const averageTrueRange = commit
            ? this.averageTrueRange.push(input.value)
            : this.averageTrueRange.preview(input.value);

        const formed = input.index + 1 >= this.length
            && middle !== null && averageTrueRange !== null;
        const offset = formed ? this.multiplier * averageTrueRange : null;
        return {
            isFormed: formed,
            values: [
                this.output('upper', formed ? middle + offset! : null, input.index),
                this.output('middle', formed ? middle : null, input.index),
                this.output('lower', formed ? middle - offset! : null, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.middle.reset();
        this.averageTrueRange.reset();
    }

    protected captureState(): KeltnerChannelsCheckpoint {
        return Object.freeze({
            middle: this.middle.checkpoint(),
            averageTrueRange: this.averageTrueRange.checkpoint(),
        });
    }

    protected restoreState(state: KeltnerChannelsCheckpoint): void {
        if (state === null || typeof state !== 'object') {
            throw new TypeError('sschart: invalid Keltner Channels checkpoint');
        }
        this.middle.restore(state.middle);
        this.averageTrueRange.restore(state.averageTrueRange);
    }
}

export class KasePeakOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    KasePeakOscillatorCheckpoint
> {
    private readonly averageTrueRange: ExpandingAverageTrueRange;
    private readonly peaks = new RingBuffer<number>(2);
    private readonly valleys = new RingBuffer<number>(2);
    private previousClose = 0;

    constructor(
        readonly atrLength: number,
        readonly shortPeriod: number,
        readonly longPeriod: number,
    ) {
        super(['shortTerm', 'longTerm']);
        integer(atrLength, atrLength, 1, 500, 'atrLength');
        integer(shortPeriod, shortPeriod, 1, 500, 'shortPeriod');
        integer(longPeriod, longPeriod, 1, 500, 'longPeriod');
        this.averageTrueRange = new ExpandingAverageTrueRange(atrLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const averageTrueRange = commit
            ? this.averageTrueRange.push(input.value)
            : this.averageTrueRange.preview(input.value);
        const atrFormedFrom = this.atrLength - 1;
        const shortFormedAt = atrFormedFrom + this.shortPeriod - 1;
        const longFormedAt = atrFormedFrom + this.longPeriod - 1;
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        if (input.index < atrFormedFrom || averageTrueRange === null
            || high === null || low === null || close === null) {
            return {
                isFormed: false,
                values: [
                    this.output('shortTerm', null, input.index),
                    this.output('longTerm', null, input.index),
                ],
            };
        }

        let peak = high;
        let valley = low;
        if (this.previousClose !== 0) {
            if (close > this.previousClose) {
                peak = Math.max(high, this.previousClose + averageTrueRange);
                valley = Math.max(low, this.previousClose - 0.5 * averageTrueRange);
            } else if (close < this.previousClose) {
                peak = Math.min(high, this.previousClose + 0.5 * averageTrueRange);
                valley = Math.min(low, this.previousClose - averageTrueRange);
            }
        }

        const peaks = this.nextBuffer(this.peaks, peak, commit);
        const valleys = this.nextBuffer(this.valleys, valley, commit);
        if (commit) this.previousClose = close;
        const maximumPeak = Math.max(...peaks);
        const minimumValley = Math.min(...valleys);
        const shortDenominator = maximumPeak - minimumValley;
        const longDenominator = peaks[0] - valleys[0];
        const shortValue = shortDenominator === 0
            ? 0
            : finite(100 * (close - minimumValley) / shortDenominator);
        const longValue = longDenominator === 0
            ? 0
            : finite(100 * (close - valleys[0]) / longDenominator);
        const shortFormed = input.index >= shortFormedAt && shortValue !== null;
        const longFormed = input.index >= longFormedAt && longValue !== null;
        return {
            isFormed: longFormed,
            values: [
                this.output('shortTerm', shortFormed ? shortValue : null, input.index),
                this.output('longTerm', longFormed ? longValue : null, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.averageTrueRange.reset();
        this.peaks.clear();
        this.valleys.clear();
        this.previousClose = 0;
    }

    protected captureState(): KasePeakOscillatorCheckpoint {
        return Object.freeze({
            averageTrueRange: this.averageTrueRange.checkpoint(),
            peaks: this.peaks.checkpoint(),
            valleys: this.valleys.checkpoint(),
            previousClose: this.previousClose,
        });
    }

    protected restoreState(state: KasePeakOscillatorCheckpoint): void {
        const validBuffer = (checkpoint: RingBufferCheckpoint<number>) => (
            checkpoint !== null
            && typeof checkpoint === 'object'
            && Array.isArray(checkpoint.values)
            && checkpoint.values.length <= 2
            && checkpoint.values.every((value) => finite(value) !== null)
        );
        if (state === null || typeof state !== 'object'
            || !validBuffer(state.peaks) || !validBuffer(state.valleys)
            || state.peaks.values.length !== state.valleys.values.length
            || finite(state.previousClose) === null) {
            throw new TypeError('sschart: invalid Kase Peak Oscillator checkpoint');
        }
        this.averageTrueRange.restore(state.averageTrueRange);
        this.peaks.restore(state.peaks);
        this.valleys.restore(state.valleys);
        this.previousClose = state.previousClose;
    }

    private nextBuffer(buffer: RingBuffer<number>, value: number, commit: boolean): number[] {
        if (commit) buffer.push(value);
        const values: number[] = [];
        for (let index = 0; index < buffer.size; index += 1) {
            const current = buffer.at(index);
            if (current !== undefined) values.push(current);
        }
        if (!commit) {
            if (values.length >= 2) values.shift();
            values.push(value);
        }
        return values;
    }
}

export class KnowSureThingProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    KnowSureThingCheckpoint
> {
    private readonly rocLengths: readonly number[];
    private readonly closes: RingBuffer<number | null>;
    private readonly averages: readonly SimpleMovingAverage[];
    private readonly signal: SimpleMovingAverage;

    constructor(
        readonly roc1Length: number,
        readonly roc2Length: number,
        readonly roc3Length: number,
        readonly roc4Length: number,
        readonly sma1Length: number,
        readonly sma2Length: number,
        readonly sma3Length: number,
        readonly sma4Length: number,
        readonly signalLength: number,
    ) {
        super(['kst', 'signal']);
        const rocLengths = [roc1Length, roc2Length, roc3Length, roc4Length];
        const smaLengths = [sma1Length, sma2Length, sma3Length, sma4Length];
        rocLengths.forEach((length, index) => (
            integer(length, length, 1, 500, `roc${index + 1}Length`)
        ));
        smaLengths.forEach((length, index) => (
            integer(length, length, 1, 500, `sma${index + 1}Length`)
        ));
        integer(signalLength, signalLength, 1, 500, 'signalLength');
        this.rocLengths = Object.freeze(rocLengths);
        this.closes = new RingBuffer<number | null>(Math.max(...rocLengths));
        this.averages = Object.freeze(smaLengths.map((length) => (
            new SimpleMovingAverage(length)
        )));
        this.signal = new SimpleMovingAverage(signalLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const current = finite(input.value?.close);
        const smoothed = this.rocLengths.map((length, index) => {
            const previous = this.closes.size >= length
                ? (this.closes.at(this.closes.size - length) ?? null)
                : null;
            const roc = current !== null && previous !== null && previous !== 0
                ? finite((current - previous) / previous * 100)
                : null;
            return commit
                ? this.averages[index].push(roc)
                : this.averages[index].preview(roc);
        });
        if (commit) this.closes.push(current);

        const kst = smoothed.every((value) => value !== null)
            ? finite(
                smoothed[0]! + 2 * smoothed[1]!
                + 3 * smoothed[2]! + 4 * smoothed[3]!,
            )
            : null;
        const signal = kst === null
            ? null
            : (commit ? this.signal.push(kst) : this.signal.preview(kst));
        return {
            isFormed: signal !== null,
            values: [
                this.output('kst', kst, input.index),
                this.output('signal', signal, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.closes.clear();
        for (const average of this.averages) average.reset();
        this.signal.reset();
    }

    protected captureState(): KnowSureThingCheckpoint {
        return Object.freeze({
            closes: this.closes.checkpoint(),
            averages: Object.freeze(this.averages.map((average) => average.checkpoint())),
            signal: this.signal.checkpoint(),
        });
    }

    protected restoreState(state: KnowSureThingCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.closes?.values)
            || state.closes.values.length > this.closes.capacity
            || state.closes.values.some((value) => value !== null && finite(value) === null)
            || !Array.isArray(state.averages) || state.averages.length !== 4) {
            throw new TypeError('sschart: invalid Know Sure Thing checkpoint');
        }
        this.closes.restore(state.closes);
        state.averages.forEach((checkpoint, index) => {
            this.averages[index].restore(checkpoint);
        });
        this.signal.restore(state.signal);
    }
}

export class BollingerPercentBProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    BollingerBandsCheckpoint
> {
    private readonly average: SimpleMovingAverage;
    private readonly deviation: RollingStandardDeviation;

    constructor(readonly length: number, readonly stdDevMultiplier: number) {
        super(['line']);
        integer(length, length, 1, 500, 'length');
        number(stdDevMultiplier, stdDevMultiplier, 1, 500, 'stdDevMultiplier');
        this.average = new SimpleMovingAverage(length);
        this.deviation = new RollingStandardDeviation(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const middle = commit ? this.average.push(close) : this.average.preview(close);
        const deviation = commit ? this.deviation.push(close) : this.deviation.preview(close);
        const formed = close !== null && middle !== null && deviation !== null;
        const width = formed ? 2 * this.stdDevMultiplier * deviation : 0;
        const value = formed && width !== 0
            ? (close - (middle - this.stdDevMultiplier * deviation)) / width * 100
            : null;
        return {
            isFormed: formed,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.average.reset();
        this.deviation.reset();
    }

    protected captureState(): BollingerBandsCheckpoint {
        return Object.freeze({
            average: this.average.checkpoint(),
            deviation: this.deviation.checkpoint(),
        });
    }

    protected restoreState(state: BollingerBandsCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || state.average?.values?.length !== state.deviation?.values?.length) {
            throw new TypeError('sschart: invalid Bollinger Percent B checkpoint');
        }
        this.average.restore(state.average);
        this.deviation.restore(state.deviation);
    }
}

export class ConstanceBrownCompositeIndexProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ConstanceBrownCompositeIndexCheckpoint
> {
    private readonly rsi: PartialRelativeStrengthIndex;
    private readonly shortRsi: PartialRelativeStrengthIndex;
    private readonly rsiHistory: RingBuffer<number | null>;
    private readonly momentum: PartialSeedSimpleMovingAverage;
    private readonly fastSma: SimpleMovingAverage;
    private readonly slowSma: SimpleMovingAverage;
    private readonly combinedBar: number;

    constructor(
        readonly rsiLength: number,
        readonly rocLength: number,
        readonly shortRsiLength: number,
        readonly momentumLength: number,
        readonly fastSmaLength: number,
        readonly slowSmaLength: number,
    ) {
        super(['composite', 'fastSma', 'slowSma']);
        for (const [value, name] of [
            [rsiLength, 'rsiLength'],
            [rocLength, 'rocLength'],
            [shortRsiLength, 'shortRsiLength'],
            [momentumLength, 'momentumLength'],
            [fastSmaLength, 'fastSmaLength'],
            [slowSmaLength, 'slowSmaLength'],
        ] as const) integer(value, value, 1, 500, name);
        this.rsi = new PartialRelativeStrengthIndex(rsiLength);
        this.shortRsi = new PartialRelativeStrengthIndex(shortRsiLength);
        this.rsiHistory = new RingBuffer(rocLength + 1);
        this.momentum = new PartialSeedSimpleMovingAverage(momentumLength);
        this.fastSma = new SimpleMovingAverage(fastSmaLength);
        this.slowSma = new SimpleMovingAverage(slowSmaLength);
        this.combinedBar = Math.max(
            rsiLength,
            shortRsiLength,
            rocLength + 1,
            momentumLength,
        );
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const rsi = commit ? this.rsi.push(close) : this.rsi.preview(close);
        const shortRsi = commit
            ? this.shortRsi.push(close)
            : this.shortRsi.preview(close);
        const roc = this.roc(rsi, commit);
        const momentum = commit
            ? this.momentum.push(shortRsi)
            : this.momentum.preview(shortRsi);
        const composite = input.index >= this.combinedBar
            && roc !== null && momentum !== null
            ? finite(roc + momentum)
            : null;
        const fastSma = commit
            ? this.fastSma.push(composite)
            : this.fastSma.preview(composite);
        const slowSma = commit
            ? this.slowSma.push(composite)
            : this.slowSma.preview(composite);
        return {
            isFormed: composite !== null && fastSma !== null && slowSma !== null,
            values: [
                this.output('composite', composite, input.index),
                this.output('fastSma', fastSma, input.index),
                this.output('slowSma', slowSma, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.rsi.reset();
        this.shortRsi.reset();
        this.rsiHistory.clear();
        this.momentum.reset();
        this.fastSma.reset();
        this.slowSma.reset();
    }

    protected captureState(): ConstanceBrownCompositeIndexCheckpoint {
        return Object.freeze({
            rsi: this.rsi.checkpoint(),
            shortRsi: this.shortRsi.checkpoint(),
            rsiHistory: this.rsiHistory.checkpoint(),
            momentum: this.momentum.checkpoint(),
            fastSma: this.fastSma.checkpoint(),
            slowSma: this.slowSma.checkpoint(),
        });
    }

    protected restoreState(state: ConstanceBrownCompositeIndexCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.rsiHistory?.values)
            || state.rsiHistory.values.length > this.rocLength + 1
            || state.rsiHistory.values.some((value) => value !== null && finite(value) === null)) {
            throw new TypeError('sschart: invalid Constance Brown Composite Index checkpoint');
        }
        this.rsi.restore(state.rsi);
        this.shortRsi.restore(state.shortRsi);
        this.rsiHistory.restore(state.rsiHistory);
        this.momentum.restore(state.momentum);
        this.fastSma.restore(state.fastSma);
        this.slowSma.restore(state.slowSma);
    }

    private roc(current: number | null, commit: boolean): number | null {
        let result: number | null = null;
        if (this.rsiHistory.size >= this.rocLength) {
            const previous = this.rsiHistory.at(this.rsiHistory.size - this.rocLength) ?? null;
            if (current !== null && previous !== null && previous !== 0)
                result = finite((current - previous) / previous * 100);
        }
        if (commit) this.rsiHistory.push(current);
        return result;
    }
}

export interface EnvelopeParameters extends IndicatorParameters {
    readonly length: number;
    readonly percent: number;
}

export class EnvelopeProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RollingWindowCheckpoint
> {
    private readonly average: SimpleMovingAverage;

    constructor(readonly length: number, readonly percent: number) {
        super(['upper', 'middle', 'lower']);
        this.average = new SimpleMovingAverage(length);
        number(percent, 2.5, 0.1, 20, 'percent');
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const middle = commit ? this.average.push(close) : this.average.preview(close);
        const offset = this.percent / 100;
        return {
            isFormed: middle !== null,
            values: [
                this.output('upper', middle === null ? null : middle * (1 + offset), input.index),
                this.output('middle', middle, input.index),
                this.output('lower', middle === null ? null : middle * (1 - offset), input.index),
            ],
        };
    }

    protected resetState(): void { this.average.reset(); }
    protected captureState(): RollingWindowCheckpoint { return this.average.checkpoint(); }
    protected restoreState(state: RollingWindowCheckpoint): void { this.average.restore(state); }
}

export interface AwesomeOscillatorParameters extends IndicatorParameters {
    readonly shortLength: number;
    readonly longLength: number;
}

export interface ElliotWaveOscillatorParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
}

export interface ElliotWaveOscillatorCheckpoint {
    readonly short: RollingWindowCheckpoint;
    readonly long: RollingWindowCheckpoint;
}

export interface GuppyMultipleMovingAverageCheckpoint {
    readonly short: readonly SeededMovingAverageCheckpoint[];
    readonly long: readonly SeededMovingAverageCheckpoint[];
}

const GMMA_SHORT_LENGTHS = Object.freeze([3, 5, 8, 10, 12, 15] as const);
const GMMA_LONG_LENGTHS = Object.freeze([30, 35, 40, 45, 50, 60] as const);
const GMMA_OUTPUTS = Object.freeze([
    ...GMMA_SHORT_LENGTHS.map((length) => `short${length}`),
    ...GMMA_LONG_LENGTHS.map((length) => `long${length}`),
]);

export interface AwesomeOscillatorCheckpoint {
    readonly short: RollingWindowCheckpoint;
    readonly long: RollingWindowCheckpoint;
    readonly previous: number | null;
}

export interface AccelerationParameters extends IndicatorParameters {
    readonly shortLength: number;
    readonly longLength: number;
    readonly smaLength: number;
}

export interface AccelerationCheckpoint {
    readonly short: RollingWindowCheckpoint;
    readonly long: RollingWindowCheckpoint;
    readonly average: RollingWindowCheckpoint;
}

export class AccelerationProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    AccelerationCheckpoint
> {
    private readonly short: SimpleMovingAverage;
    private readonly long: SimpleMovingAverage;
    private readonly average: SimpleMovingAverage;

    constructor(
        readonly shortLength: number,
        readonly longLength: number,
        readonly smaLength: number,
    ) {
        super(['line']);
        this.short = new SimpleMovingAverage(shortLength);
        this.long = new SimpleMovingAverage(longLength);
        this.average = new SimpleMovingAverage(smaLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const median = high === null || low === null ? null : (high + low) / 2;
        const short = commit ? this.short.push(median) : this.short.preview(median);
        const long = commit ? this.long.push(median) : this.long.preview(median);
        const awesome = short === null || long === null ? null : short - long;
        const average = commit
            ? this.average.push(awesome)
            : this.average.preview(awesome);
        const value = awesome === null || average === null ? null : awesome - average;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.short.reset();
        this.long.reset();
        this.average.reset();
    }
    protected captureState(): AccelerationCheckpoint {
        return Object.freeze({
            short: this.short.checkpoint(),
            long: this.long.checkpoint(),
            average: this.average.checkpoint(),
        });
    }
    protected restoreState(state: AccelerationCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid Acceleration checkpoint');
        this.short.restore(state.short);
        this.long.restore(state.long);
        this.average.restore(state.average);
    }
}

export class AwesomeOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    AwesomeOscillatorCheckpoint
> {
    private readonly short: SimpleMovingAverage;
    private readonly long: SimpleMovingAverage;
    private previous: number | null = null;

    constructor(readonly shortLength: number, readonly longLength: number) {
        super(['value']);
        this.short = new SimpleMovingAverage(shortLength);
        this.long = new SimpleMovingAverage(longLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const median = high === null || low === null ? null : (high + low) / 2;
        const short = commit ? this.short.push(median) : this.short.preview(median);
        const long = commit ? this.long.push(median) : this.long.preview(median);
        const value = short === null || long === null ? null : short - long;
        const up = value === null || this.previous === null ? true : value >= this.previous;
        if (commit && value !== null) this.previous = value;
        return {
            isFormed: value !== null,
            values: [this.output('value', value, input.index, { up })],
        };
    }

    protected resetState(): void {
        this.short.reset();
        this.long.reset();
        this.previous = null;
    }
    protected captureState(): AwesomeOscillatorCheckpoint {
        return Object.freeze({
            short: this.short.checkpoint(),
            long: this.long.checkpoint(),
            previous: this.previous,
        });
    }
    protected restoreState(state: AwesomeOscillatorCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || (state.previous !== null && finite(state.previous) === null)) {
            throw new TypeError('sschart: invalid Awesome Oscillator checkpoint');
        }
        this.short.restore(state.short);
        this.long.restore(state.long);
        this.previous = state.previous;
    }
}

export class ElliotWaveOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ElliotWaveOscillatorCheckpoint
> {
    private readonly short: SimpleMovingAverage;
    private readonly long: SimpleMovingAverage;

    constructor(readonly shortPeriod: number, readonly longPeriod: number) {
        super(['line']);
        this.short = new SimpleMovingAverage(
            integer(shortPeriod, shortPeriod, 1, 500, 'shortPeriod'),
        );
        this.long = new SimpleMovingAverage(
            integer(longPeriod, longPeriod, 1, 500, 'longPeriod'),
        );
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = finite(input.value?.close);
        const short = commit ? this.short.push(value) : this.short.preview(value);
        const long = commit ? this.long.push(value) : this.long.preview(value);
        const oscillator = short === null || long === null ? null : short - long;
        return {
            isFormed: oscillator !== null,
            values: [this.output('line', oscillator, input.index)],
        };
    }

    protected resetState(): void {
        this.short.reset();
        this.long.reset();
    }

    protected captureState(): ElliotWaveOscillatorCheckpoint {
        return Object.freeze({
            short: this.short.checkpoint(),
            long: this.long.checkpoint(),
        });
    }

    protected restoreState(state: ElliotWaveOscillatorCheckpoint): void {
        const valid = (checkpoint: RollingWindowCheckpoint, maximum: number) => (
            checkpoint !== null
            && typeof checkpoint === 'object'
            && Array.isArray(checkpoint.values)
            && checkpoint.values.length <= maximum
            && checkpoint.values.every((value) => value === null || finite(value) !== null)
        );
        if (state === null || typeof state !== 'object'
            || !valid(state.short, this.shortPeriod)
            || !valid(state.long, this.longPeriod)) {
            throw new TypeError('sschart: invalid Elliot Wave Oscillator checkpoint');
        }
        this.short.restore(state.short);
        this.long.restore(state.long);
    }
}

export class GuppyMultipleMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    GuppyMultipleMovingAverageCheckpoint
> {
    private readonly short = GMMA_SHORT_LENGTHS.map(
        (length) => new ExponentialMovingAverage(length),
    );
    private readonly long = GMMA_LONG_LENGTHS.map(
        (length) => new ExponentialMovingAverage(length),
    );

    constructor() {
        super(GMMA_OUTPUTS);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const short = this.short.map((average) => (
            commit ? average.push(close) : average.preview(close)
        ));
        const long = this.long.map((average) => (
            commit ? average.push(close) : average.preview(close)
        ));
        const values = [
            ...short.map((value, index) => this.output(
                `short${GMMA_SHORT_LENGTHS[index]}`,
                value,
                input.index,
            )),
            ...long.map((value, index) => this.output(
                `long${GMMA_LONG_LENGTHS[index]}`,
                value,
                input.index,
            )),
        ];
        return {
            isFormed: long[long.length - 1] !== null,
            values,
        };
    }

    protected resetState(): void {
        for (const average of this.short) average.reset();
        for (const average of this.long) average.reset();
    }

    protected captureState(): GuppyMultipleMovingAverageCheckpoint {
        return Object.freeze({
            short: Object.freeze(this.short.map((average) => average.checkpoint())),
            long: Object.freeze(this.long.map((average) => average.checkpoint())),
        });
    }

    protected restoreState(state: GuppyMultipleMovingAverageCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.short) || state.short.length !== this.short.length
            || !Array.isArray(state.long) || state.long.length !== this.long.length) {
            throw new TypeError('sschart: invalid Guppy Multiple Moving Average checkpoint');
        }
        state.short.forEach((checkpoint, index) => this.short[index].restore(checkpoint));
        state.long.forEach((checkpoint, index) => this.long[index].restore(checkpoint));
    }
}

export interface FiniteExponentialCheckpoint {
    readonly count: number;
    readonly seedSum: number;
    readonly formed: boolean;
    readonly previous: number;
}

class FiniteExponentialAverage {
    private count = 0;
    private seedSum = 0;
    private formed = false;
    private previous = 0;
    private readonly multiplier: number;

    constructor(readonly length: number) {
        integer(length, length, 1, 10_000, 'EMA length');
        this.multiplier = 2 / (length + 1);
    }

    push(value: number | null): number | null {
        const next = this.evaluate(value);
        this.count = next.count;
        this.seedSum = next.seedSum;
        this.formed = next.formed;
        this.previous = next.previous;
        return next.value;
    }

    preview(value: number | null): number | null { return this.evaluate(value).value; }

    reset(): void {
        this.count = 0;
        this.seedSum = 0;
        this.formed = false;
        this.previous = 0;
    }

    checkpoint(): FiniteExponentialCheckpoint {
        return Object.freeze({
            count: this.count,
            seedSum: this.seedSum,
            formed: this.formed,
            previous: this.previous,
        });
    }

    restore(state: FiniteExponentialCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Number.isInteger(state.count) || state.count < 0 || state.count > this.length
            || finite(state.seedSum) === null || typeof state.formed !== 'boolean'
            || finite(state.previous) === null
            || state.formed !== (state.count === this.length)) {
            throw new TypeError('sschart: invalid finite EMA checkpoint');
        }
        this.count = state.count;
        this.seedSum = state.seedSum;
        this.formed = state.formed;
        this.previous = state.previous;
    }

    private evaluate(value: number | null): FiniteExponentialCheckpoint & {
        readonly value: number | null;
    } {
        if (value === null) {
            return {
                count: this.count,
                seedSum: this.seedSum,
                formed: this.formed,
                previous: this.previous,
                value: null,
            };
        }
        if (!this.formed) {
            const count = this.count + 1;
            const seedSum = this.seedSum + value;
            const formed = count === this.length;
            const previous = formed ? seedSum / this.length : this.previous;
            return {
                count,
                seedSum,
                formed,
                previous,
                value: formed ? previous : null,
            };
        }
        const previous = (value - this.previous) * this.multiplier + this.previous;
        return {
            count: this.count,
            seedSum: this.seedSum,
            formed: true,
            previous,
            value: previous,
        };
    }
}

export class KlingerVolumeOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    KlingerVolumeOscillatorCheckpoint
> {
    private previousHlc = 0;
    private readonly short: FiniteExponentialAverage;
    private readonly long: FiniteExponentialAverage;

    constructor(readonly shortPeriod: number, readonly longPeriod: number) {
        super(['shortEma', 'longEma', 'oscillator']);
        integer(shortPeriod, shortPeriod, 1, 500, 'shortPeriod');
        integer(longPeriod, longPeriod, 1, 500, 'longPeriod');
        this.short = new FiniteExponentialAverage(shortPeriod);
        this.long = new FiniteExponentialAverage(longPeriod);
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
        const typical = valid ? finite((high + low + close) / 3) : null;
        const signedVolume = typical === null || volume === null
            ? null
            : finite(volume * (typical > this.previousHlc ? 1 : -1));
        const short = commit ? this.short.push(signedVolume) : this.short.preview(signedVolume);
        const long = commit ? this.long.push(signedVolume) : this.long.preview(signedVolume);
        if (commit && typical !== null) this.previousHlc = typical;
        const oscillator = short === null || long === null ? null : finite(short - long);
        return {
            isFormed: oscillator !== null,
            values: [
                this.output('shortEma', short, input.index),
                this.output('longEma', long, input.index),
                this.output('oscillator', oscillator, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.previousHlc = 0;
        this.short.reset();
        this.long.reset();
    }

    protected captureState(): KlingerVolumeOscillatorCheckpoint {
        return Object.freeze({
            previousHlc: this.previousHlc,
            short: this.short.checkpoint(),
            long: this.long.checkpoint(),
        });
    }

    protected restoreState(state: KlingerVolumeOscillatorCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.previousHlc) === null) {
            throw new TypeError('sschart: invalid Klinger Volume Oscillator checkpoint');
        }
        this.short.restore(state.short);
        this.long.restore(state.long);
        this.previousHlc = state.previousHlc;
    }
}

export class MovingAverageCrossoverProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    MovingAverageCrossoverCheckpoint
> {
    private readonly fast: SimpleMovingAverage;
    private readonly slow: SimpleMovingAverage;

    constructor(readonly shortPeriod: number, readonly longPeriod: number) {
        super(['signal']);
        integer(shortPeriod, shortPeriod, 1, 500, 'shortPeriod');
        integer(longPeriod, longPeriod, 1, 500, 'longPeriod');
        this.fast = new SimpleMovingAverage(shortPeriod);
        this.slow = new SimpleMovingAverage(longPeriod);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const fast = commit ? this.fast.push(close) : this.fast.preview(close);
        const slow = commit ? this.slow.push(close) : this.slow.preview(close);
        const signal = fast === null || slow === null
            ? null
            : (fast > slow ? 1 : (fast < slow ? -1 : 0));
        return {
            isFormed: signal !== null,
            values: [this.output('signal', signal, input.index)],
        };
    }

    protected resetState(): void {
        this.fast.reset();
        this.slow.reset();
    }

    protected captureState(): MovingAverageCrossoverCheckpoint {
        return Object.freeze({
            fast: this.fast.checkpoint(),
            slow: this.slow.checkpoint(),
        });
    }

    protected restoreState(state: MovingAverageCrossoverCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid Moving Average Crossover checkpoint');
        this.fast.restore(state.fast);
        this.slow.restore(state.slow);
    }
}

export class MovingAverageRibbonProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    MovingAverageRibbonCheckpoint
> {
    readonly lengths: readonly number[];
    private readonly averages: readonly SimpleMovingAverage[];

    constructor(shortPeriod: number, longPeriod: number, ribbonCount: number) {
        const lengths = movingAverageRibbonLengths(shortPeriod, longPeriod, ribbonCount);
        super(lengths.map((_, index) => `ribbon${index}`));
        this.lengths = lengths;
        this.averages = Object.freeze(lengths.map((length) => (
            new SimpleMovingAverage(length)
        )));
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        let current = finite(input.value?.close);
        const values = this.averages.map((average, index) => {
            let value: number | null = null;
            if (current !== null) {
                value = commit ? average.push(current) : average.preview(current);
                current = value;
            }
            return this.output(`ribbon${index}`, value, input.index);
        });
        return {
            isFormed: values[values.length - 1].value !== null,
            values,
        };
    }

    protected resetState(): void {
        for (const average of this.averages) average.reset();
    }

    protected captureState(): MovingAverageRibbonCheckpoint {
        return Object.freeze({
            averages: Object.freeze(this.averages.map((average) => average.checkpoint())),
        });
    }

    protected restoreState(state: MovingAverageRibbonCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.averages)
            || state.averages.length !== this.averages.length) {
            throw new TypeError('sschart: invalid Moving Average Ribbon checkpoint');
        }
        this.averages.forEach((average, index) => average.restore(state.averages[index]));
    }
}

export class RainbowChartsProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    RainbowChartsCheckpoint
> {
    private readonly averages: readonly SimpleMovingAverage[];

    constructor(readonly lines: number) {
        integer(lines, lines, 2, 500, 'lines');
        const lengths = Array.from({ length: lines - 1 }, (_, index) => (index + 1) * 2);
        super(lengths.map((_, index) => `sma${index + 1}`));
        this.averages = Object.freeze(lengths.map((length) => (
            new SimpleMovingAverage(length)
        )));
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const values = this.averages.map((average, index) => this.output(
            `sma${index + 1}`,
            commit ? average.push(close) : average.preview(close),
            input.index,
        ));
        return {
            isFormed: values[values.length - 1].value !== null,
            values,
        };
    }

    protected resetState(): void {
        for (const average of this.averages) average.reset();
    }

    protected captureState(): RainbowChartsCheckpoint {
        return Object.freeze({
            averages: Object.freeze(this.averages.map((average) => average.checkpoint())),
        });
    }

    protected restoreState(state: RainbowChartsCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.averages)
            || state.averages.length !== this.averages.length) {
            throw new TypeError('sschart: invalid Rainbow Charts checkpoint');
        }
        this.averages.forEach((average, index) => average.restore(state.averages[index]));
    }
}

export class McClellanOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    McClellanOscillatorCheckpoint
> {
    private readonly short: ExponentialMovingAverage;
    private readonly long: ExponentialMovingAverage;

    constructor(readonly shortLength: number, readonly longLength: number) {
        super(['line']);
        integer(shortLength, shortLength, 1, 500, 'shortLength');
        integer(longLength, longLength, 1, 500, 'longLength');
        this.short = new ExponentialMovingAverage(shortLength);
        this.long = new ExponentialMovingAverage(longLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const short = commit ? this.short.push(close) : this.short.preview(close);
        const long = commit ? this.long.push(close) : this.long.preview(close);
        const value = short === null || long === null ? null : finite(short - long);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.short.reset();
        this.long.reset();
    }

    protected captureState(): McClellanOscillatorCheckpoint {
        return Object.freeze({
            short: this.short.checkpoint(),
            long: this.long.checkpoint(),
        });
    }

    protected restoreState(state: McClellanOscillatorCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid McClellan Oscillator checkpoint');
        this.short.restore(state.short);
        this.long.restore(state.long);
    }
}

export class CompositeMomentumProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    CompositeMomentumCheckpoint
> {
    private readonly shortRoc: RingBuffer<number | null>;
    private readonly longRoc: RingBuffer<number | null>;
    private readonly rsi: PartialRelativeStrengthIndex;
    private readonly fast: FiniteExponentialAverage;
    private readonly slow: FiniteExponentialAverage;
    private readonly average: SimpleMovingAverage;

    constructor(
        readonly shortRocLength: number,
        readonly longRocLength: number,
        readonly rsiLength: number,
        readonly fastLength: number,
        readonly slowLength: number,
        readonly smaLength: number,
    ) {
        super(['composite', 'sma']);
        for (const [value, name] of [
            [shortRocLength, 'shortRocLength'],
            [longRocLength, 'longRocLength'],
            [rsiLength, 'rsiLength'],
            [fastLength, 'fastLength'],
            [slowLength, 'slowLength'],
            [smaLength, 'smaLength'],
        ] as const) integer(value, value, 1, 500, name);
        this.shortRoc = new RingBuffer(shortRocLength + 1);
        this.longRoc = new RingBuffer(longRocLength + 1);
        this.rsi = new PartialRelativeStrengthIndex(rsiLength);
        this.fast = new FiniteExponentialAverage(fastLength);
        this.slow = new FiniteExponentialAverage(slowLength);
        this.average = new SimpleMovingAverage(smaLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const shortRoc = this.rateOfChange(
            this.shortRoc,
            this.shortRocLength,
            close,
            commit,
        );
        const longRoc = this.rateOfChange(
            this.longRoc,
            this.longRocLength,
            close,
            commit,
        );
        const partialRsi = commit ? this.rsi.push(close) : this.rsi.preview(close);
        const rsi = input.index >= this.rsiLength ? partialRsi : null;
        const fast = commit ? this.fast.push(close) : this.fast.preview(close);
        const slow = commit ? this.slow.push(close) : this.slow.preview(close);

        let composite: number | null = null;
        if (shortRoc !== null && longRoc !== null && rsi !== null
            && fast !== null && slow !== null) {
            const normalizedShort = shortRoc / 100;
            const normalizedLong = longRoc / 100;
            const normalizedRsi = (rsi - 50) / 50;
            const macd = slow === 0 ? 0 : (fast - slow) / slow;
            composite = finite(
                (normalizedShort + normalizedLong + normalizedRsi + macd) / 4 * 100,
            );
        }

        const sma = composite === null
            ? null
            : (commit ? this.average.push(composite) : this.average.preview(composite));
        return {
            isFormed: composite !== null && sma !== null,
            values: [
                this.output('composite', composite, input.index),
                this.output('sma', sma, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.shortRoc.clear();
        this.longRoc.clear();
        this.rsi.reset();
        this.fast.reset();
        this.slow.reset();
        this.average.reset();
    }

    protected captureState(): CompositeMomentumCheckpoint {
        return Object.freeze({
            shortRoc: this.shortRoc.checkpoint(),
            longRoc: this.longRoc.checkpoint(),
            rsi: this.rsi.checkpoint(),
            fast: this.fast.checkpoint(),
            slow: this.slow.checkpoint(),
            average: this.average.checkpoint(),
        });
    }

    protected restoreState(state: CompositeMomentumCheckpoint): void {
        const histories = [
            [state?.shortRoc, this.shortRocLength + 1],
            [state?.longRoc, this.longRocLength + 1],
        ] as const;
        if (state === null || typeof state !== 'object'
            || histories.some(([history, capacity]) => (
                !Array.isArray(history?.values) || history.values.length > capacity
                || history.values.some((value) => value !== null && finite(value) === null)
            ))) {
            throw new TypeError('sschart: invalid Composite Momentum checkpoint');
        }
        this.shortRoc.restore(state.shortRoc);
        this.longRoc.restore(state.longRoc);
        this.rsi.restore(state.rsi);
        this.fast.restore(state.fast);
        this.slow.restore(state.slow);
        this.average.restore(state.average);
    }

    private rateOfChange(
        history: RingBuffer<number | null>,
        length: number,
        current: number | null,
        commit: boolean,
    ): number | null {
        let result: number | null = null;
        if (history.size >= length) {
            const previous = history.at(history.size - length) ?? null;
            if (current !== null && previous !== null && previous !== 0)
                result = finite((current - previous) / previous * 100);
        }
        if (commit) history.push(current);
        return result;
    }
}

export class ElderImpulseProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ElderImpulseCheckpoint
> {
    private readonly ema: PartialSeedExponentialMovingAverage;
    private readonly fast: PartialSeedExponentialMovingAverage;
    private readonly slow: PartialSeedExponentialMovingAverage;
    private readonly formBar: number;
    private previousEma: number | null = null;
    private previousMacd: number | null = null;

    constructor(
        readonly emaLength: number,
        readonly fastLength: number,
        readonly slowLength: number,
    ) {
        super(['impulse']);
        integer(emaLength, emaLength, 1, 500, 'emaLength');
        integer(fastLength, fastLength, 1, 500, 'fastLength');
        integer(slowLength, slowLength, 1, 500, 'slowLength');
        this.ema = new PartialSeedExponentialMovingAverage(emaLength);
        this.fast = new PartialSeedExponentialMovingAverage(fastLength);
        this.slow = new PartialSeedExponentialMovingAverage(slowLength);
        this.formBar = Math.max(emaLength - 1, slowLength - 1);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const ema = commit ? this.ema.push(close) : this.ema.preview(close);
        const fast = commit ? this.fast.push(close) : this.fast.preview(close);
        const slow = commit ? this.slow.push(close) : this.slow.preview(close);
        const macd = fast === null || slow === null ? null : finite(fast - slow);
        const formed = input.index >= this.formBar && input.index > 0
            && ema !== null && macd !== null
            && this.previousEma !== null && this.previousMacd !== null;

        let value: number | null = null;
        let state: 'green' | 'blue' | 'red' | null = null;
        if (formed) {
            if (ema > this.previousEma! && macd > this.previousMacd!) {
                value = 1;
                state = 'green';
            } else if (ema < this.previousEma! && macd < this.previousMacd!) {
                value = -1;
                state = 'red';
            } else {
                value = 0;
                state = 'blue';
            }
        }
        if (commit) {
            this.previousEma = ema;
            this.previousMacd = macd;
        }
        return {
            isFormed: formed,
            values: [this.output(
                'impulse',
                value,
                input.index,
                state === null ? undefined : { state },
            )],
        };
    }

    protected resetState(): void {
        this.ema.reset();
        this.fast.reset();
        this.slow.reset();
        this.previousEma = null;
        this.previousMacd = null;
    }

    protected captureState(): ElderImpulseCheckpoint {
        return Object.freeze({
            ema: this.ema.checkpoint(),
            fast: this.fast.checkpoint(),
            slow: this.slow.checkpoint(),
            previousEma: this.previousEma,
            previousMacd: this.previousMacd,
        });
    }

    protected restoreState(state: ElderImpulseCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || (state.previousEma !== null && finite(state.previousEma) === null)
            || (state.previousMacd !== null && finite(state.previousMacd) === null)
            || (state.previousEma === null) !== (state.previousMacd === null)) {
            throw new TypeError('sschart: invalid Elder Impulse checkpoint');
        }
        this.ema.restore(state.ema);
        this.fast.restore(state.fast);
        this.slow.restore(state.slow);
        this.previousEma = state.previousEma;
        this.previousMacd = state.previousMacd;
    }
}

export interface MacdParameters extends IndicatorParameters {
    readonly fastLength: number;
    readonly slowLength: number;
    readonly signalLength: number;
}

export interface MacdSignalParameters extends IndicatorParameters {
    readonly longLength: number;
    readonly shortLength: number;
    readonly signalLength: number;
}

export interface PercentagePriceOscillatorParameters extends IndicatorParameters {
    readonly shortLength: number;
    readonly longLength: number;
    readonly signalLength: number;
}

export interface PercentagePriceOscillatorCheckpoint {
    readonly short: FiniteExponentialCheckpoint;
    readonly long: FiniteExponentialCheckpoint;
    readonly signal: FiniteExponentialCheckpoint;
}

export interface SchaffTrendCycleParameters extends IndicatorParameters {
    readonly length: number;
    readonly shortLength: number;
    readonly longLength: number;
    readonly cycleLength: number;
    readonly signalLength: number;
}

export interface SchaffTrendCycleCheckpoint {
    readonly macd: MacdCheckpoint;
    readonly closeHigh: RollingWindowCheckpoint;
    readonly closeLow: RollingWindowCheckpoint;
    readonly stochasticHigh: RollingWindowCheckpoint;
    readonly stochasticLow: RollingWindowCheckpoint;
    readonly average: FiniteExponentialCheckpoint;
    readonly previousStochastic: number;
}

export interface CompoundLengthParameters extends IndicatorParameters {
    readonly length: number;
}

export interface DoubleExponentialMovingAverageCheckpoint {
    readonly first: SeededMovingAverageCheckpoint;
    readonly second: FiniteExponentialCheckpoint;
}

export interface TripleExponentialMovingAverageCheckpoint {
    readonly first: SeededMovingAverageCheckpoint;
    readonly second: FiniteExponentialCheckpoint;
    readonly third: FiniteExponentialCheckpoint;
}

export interface T3MovingAverageParameters extends IndicatorParameters {
    readonly length: number;
    readonly volumeFactor: number;
}

export interface T3MovingAverageCheckpoint {
    readonly averages: readonly PartialSeedExponentialMovingAverageCheckpoint[];
    readonly warmUpPeriod: number;
}

export interface TrixCheckpoint {
    readonly first: FiniteExponentialCheckpoint;
    readonly second: FiniteExponentialCheckpoint;
    readonly third: FiniteExponentialCheckpoint;
    readonly previous: number | null;
}

export class TrixProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    TrixCheckpoint
> {
    private readonly first: FiniteExponentialAverage;
    private readonly second: FiniteExponentialAverage;
    private readonly third: FiniteExponentialAverage;
    private previous: number | null = null;

    constructor(readonly length: number) {
        super(['line']);
        this.first = new FiniteExponentialAverage(length);
        this.second = new FiniteExponentialAverage(length);
        this.third = new FiniteExponentialAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const first = commit ? this.first.push(close) : this.first.preview(close);
        const second = commit ? this.second.push(first) : this.second.preview(first);
        const third = commit ? this.third.push(second) : this.third.preview(second);

        let value: number | null = null;
        if (third === null) {
            if (commit) this.previous = null;
        } else if (this.previous === null || this.previous === 0) {
            if (commit) this.previous = third;
        } else {
            value = 1_000 * (third - this.previous) / this.previous;
            if (commit) this.previous = third;
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.first.reset();
        this.second.reset();
        this.third.reset();
        this.previous = null;
    }
    protected captureState(): TrixCheckpoint {
        return Object.freeze({
            first: this.first.checkpoint(),
            second: this.second.checkpoint(),
            third: this.third.checkpoint(),
            previous: this.previous,
        });
    }
    protected restoreState(state: TrixCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || (state.previous !== null && finite(state.previous) === null)) {
            throw new TypeError('sschart: invalid Trix checkpoint');
        }
        this.first.restore(state.first);
        this.second.restore(state.second);
        this.third.restore(state.third);
        this.previous = state.previous;
    }
}

export interface HullMovingAverageParameters extends IndicatorParameters {
    readonly length: number;
    readonly sqrtPeriod: number;
}

export interface HullMovingAverageCheckpoint {
    readonly slow: RollingWindowCheckpoint;
    readonly fast: RollingWindowCheckpoint;
    readonly result: RollingWindowCheckpoint;
}

export class DoubleExponentialMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    DoubleExponentialMovingAverageCheckpoint
> {
    private readonly first: ExponentialMovingAverage;
    private readonly second: FiniteExponentialAverage;

    constructor(readonly length: number) {
        super(['line']);
        this.first = new ExponentialMovingAverage(length);
        this.second = new FiniteExponentialAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const first = commit ? this.first.push(close) : this.first.preview(close);
        const second = commit ? this.second.push(first) : this.second.preview(first);
        const value = first === null || second === null ? null : 2 * first - second;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.first.reset();
        this.second.reset();
    }
    protected captureState(): DoubleExponentialMovingAverageCheckpoint {
        return Object.freeze({
            first: this.first.checkpoint(),
            second: this.second.checkpoint(),
        });
    }
    protected restoreState(state: DoubleExponentialMovingAverageCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid DEMA checkpoint');
        this.first.restore(state.first);
        this.second.restore(state.second);
    }
}

export class TripleExponentialMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    TripleExponentialMovingAverageCheckpoint
> {
    private readonly first: ExponentialMovingAverage;
    private readonly second: FiniteExponentialAverage;
    private readonly third: FiniteExponentialAverage;

    constructor(readonly length: number) {
        super(['line']);
        this.first = new ExponentialMovingAverage(length);
        this.second = new FiniteExponentialAverage(length);
        this.third = new FiniteExponentialAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const first = commit ? this.first.push(close) : this.first.preview(close);
        const second = commit ? this.second.push(first) : this.second.preview(first);
        const third = commit ? this.third.push(second) : this.third.preview(second);
        const value = first === null || second === null || third === null
            ? null
            : 3 * first - 3 * second + third;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.first.reset();
        this.second.reset();
        this.third.reset();
    }
    protected captureState(): TripleExponentialMovingAverageCheckpoint {
        return Object.freeze({
            first: this.first.checkpoint(),
            second: this.second.checkpoint(),
            third: this.third.checkpoint(),
        });
    }
    protected restoreState(state: TripleExponentialMovingAverageCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid TEMA checkpoint');
        this.first.restore(state.first);
        this.second.restore(state.second);
        this.third.restore(state.third);
    }
}

const T3_AVERAGE_COUNT = 6;
const T3_WARM_UP_PERIOD = 10;

export class T3MovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    T3MovingAverageCheckpoint
> {
    private readonly averages: readonly PartialSeedExponentialMovingAverage[];
    private readonly coefficients: readonly [number, number, number, number];
    private warmUpPeriod = T3_WARM_UP_PERIOD;

    constructor(readonly length: number, readonly volumeFactor: number) {
        super(['line']);
        integer(length, length, 1, 500, 'length');
        if (typeof volumeFactor !== 'number' || !Number.isFinite(volumeFactor)
            || volumeFactor <= 0 || volumeFactor >= 1) {
            throw new RangeError('sschart: T3 volumeFactor must be finite between 0 and 1');
        }
        this.averages = Object.freeze(Array.from(
            { length: T3_AVERAGE_COUNT },
            () => new PartialSeedExponentialMovingAverage(length),
        ));
        const squared = volumeFactor * volumeFactor;
        const cubed = squared * volumeFactor;
        this.coefficients = Object.freeze([
            -cubed,
            3 * squared + 3 * cubed,
            -6 * squared - 3 * volumeFactor - 3 * cubed,
            1 + 3 * volumeFactor + cubed + 3 * squared,
        ]);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const values: Array<number | null> = [];
        let current = finite(input.value?.close);
        for (const average of this.averages) {
            current = commit ? average.push(current) : average.preview(current);
            values.push(current);
        }

        const allValuesFinite = values.every((value) => value !== null);
        const allFormed = allValuesFinite && this.averages.every((average) => (
            average.isFormed
            || (!commit && average.checkpoint().count + 1 >= average.windowLength)
        ));
        let effectiveWarmUp = this.warmUpPeriod;
        if (allFormed && effectiveWarmUp > 0) {
            effectiveWarmUp -= 1;
            if (commit) this.warmUpPeriod = effectiveWarmUp;
        }

        let value: number | null = null;
        if (allFormed && effectiveWarmUp === 0) {
            const [c1, c2, c3, c4] = this.coefficients;
            value = finite(
                c1 * values[5]!
                + c2 * values[4]!
                + c3 * values[3]!
                + c4 * values[2]!,
            );
        }
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        for (const average of this.averages) average.reset();
        this.warmUpPeriod = T3_WARM_UP_PERIOD;
    }

    protected captureState(): T3MovingAverageCheckpoint {
        return Object.freeze({
            averages: Object.freeze(this.averages.map((average) => average.checkpoint())),
            warmUpPeriod: this.warmUpPeriod,
        });
    }

    protected restoreState(state: T3MovingAverageCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Array.isArray(state.averages)
            || state.averages.length !== T3_AVERAGE_COUNT
            || !Number.isInteger(state.warmUpPeriod)
            || state.warmUpPeriod < 0 || state.warmUpPeriod > T3_WARM_UP_PERIOD
            || state.averages.some((checkpoint) => (
                checkpoint?.count !== state.averages[0]?.count
            ))) {
            throw new TypeError('sschart: invalid T3 Moving Average checkpoint');
        }
        state.averages.forEach((checkpoint, index) => {
            this.averages[index].restore(checkpoint);
        });
        this.warmUpPeriod = state.warmUpPeriod;
    }
}

export class HullMovingAverageProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    HullMovingAverageCheckpoint
> {
    readonly halfLength: number;
    readonly resultLength: number;
    private readonly slow: LinearWeightedMovingAverage;
    private readonly fast: LinearWeightedMovingAverage;
    private readonly result: LinearWeightedMovingAverage;

    constructor(readonly length: number, readonly sqrtPeriod: number) {
        super(['line']);
        integer(length, length, 1, 500, 'length');
        integer(sqrtPeriod, sqrtPeriod, 0, 500, 'sqrtPeriod');
        this.halfLength = Math.floor(length / 2);
        this.resultLength = sqrtPeriod > 0 ? sqrtPeriod : Math.floor(Math.sqrt(length));
        this.slow = new LinearWeightedMovingAverage(length);
        this.fast = new LinearWeightedMovingAverage(Math.max(1, this.halfLength));
        this.result = new LinearWeightedMovingAverage(Math.max(1, this.resultLength));
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        if (this.halfLength === 0 || this.resultLength === 0) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }
        const close = finite(input.value?.close);
        const slow = commit ? this.slow.push(close) : this.slow.preview(close);
        const fast = commit ? this.fast.push(close) : this.fast.preview(close);
        const raw = slow === null || fast === null ? null : 2 * fast - slow;
        const value = commit ? this.result.push(raw) : this.result.preview(raw);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.slow.reset();
        this.fast.reset();
        this.result.reset();
    }
    protected captureState(): HullMovingAverageCheckpoint {
        return Object.freeze({
            slow: this.slow.checkpoint(),
            fast: this.fast.checkpoint(),
            result: this.result.checkpoint(),
        });
    }
    protected restoreState(state: HullMovingAverageCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid HMA checkpoint');
        this.slow.restore(state.slow);
        this.fast.restore(state.fast);
        this.result.restore(state.result);
    }
}

export interface MacdCheckpoint {
    readonly fast: FiniteExponentialCheckpoint;
    readonly slow: FiniteExponentialCheckpoint;
    readonly signal: FiniteExponentialCheckpoint;
}

interface MacdEvaluation {
    readonly macd: number | null;
    readonly signal: number | null;
    readonly histogram: number | null;
}

class MacdKernel {
    private readonly fast: FiniteExponentialAverage;
    private readonly slow: FiniteExponentialAverage;
    private readonly signal: FiniteExponentialAverage;

    constructor(fastLength: number, slowLength: number, signalLength: number) {
        this.fast = new FiniteExponentialAverage(fastLength);
        this.slow = new FiniteExponentialAverage(slowLength);
        this.signal = new FiniteExponentialAverage(signalLength);
    }

    push(value: number | null): MacdEvaluation { return this.evaluate(value, true); }
    preview(value: number | null): MacdEvaluation { return this.evaluate(value, false); }

    reset(): void {
        this.fast.reset();
        this.slow.reset();
        this.signal.reset();
    }

    checkpoint(): MacdCheckpoint {
        return Object.freeze({
            fast: this.fast.checkpoint(),
            slow: this.slow.checkpoint(),
            signal: this.signal.checkpoint(),
        });
    }

    restore(state: MacdCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid MACD checkpoint');
        this.fast.restore(state.fast);
        this.slow.restore(state.slow);
        this.signal.restore(state.signal);
    }

    private evaluate(value: number | null, commit: boolean): MacdEvaluation {
        const fast = commit ? this.fast.push(value) : this.fast.preview(value);
        const slow = commit ? this.slow.push(value) : this.slow.preview(value);
        const macd = fast === null || slow === null ? null : fast - slow;
        const signal = commit ? this.signal.push(macd) : this.signal.preview(macd);
        const histogram = macd === null || signal === null ? null : macd - signal;
        return { macd, signal, histogram };
    }
}

export class MacdProcessor extends SequentialIndicatorProcessor<IndicatorCandle, MacdCheckpoint> {
    private readonly kernel: MacdKernel;

    constructor(
        readonly fastLength: number,
        readonly slowLength: number,
        readonly signalLength: number,
    ) {
        super(['macd', 'signal', 'histogram']);
        this.kernel = new MacdKernel(fastLength, slowLength, signalLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = commit
            ? this.kernel.push(finite(input.value?.close))
            : this.kernel.preview(finite(input.value?.close));
        return {
            isFormed: value.histogram !== null,
            values: [
                this.output('macd', value.macd, input.index),
                this.output('signal', value.signal, input.index),
                this.output('histogram', value.histogram, input.index),
            ],
        };
    }

    protected resetState(): void { this.kernel.reset(); }
    protected captureState(): MacdCheckpoint { return this.kernel.checkpoint(); }
    protected restoreState(state: MacdCheckpoint): void { this.kernel.restore(state); }
}

export class MacdSignalProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    MacdCheckpoint
> {
    private readonly kernel: MacdKernel;

    constructor(
        readonly longLength: number,
        readonly shortLength: number,
        readonly signalLength: number,
    ) {
        super(['macd', 'signal']);
        integer(longLength, longLength, 1, 500, 'longLength');
        integer(shortLength, shortLength, 1, 500, 'shortLength');
        integer(signalLength, signalLength, 1, 500, 'signalLength');
        this.kernel = new MacdKernel(shortLength, longLength, signalLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = commit
            ? this.kernel.push(finite(input.value?.close))
            : this.kernel.preview(finite(input.value?.close));
        return {
            isFormed: value.signal !== null,
            values: [
                this.output('macd', value.macd, input.index),
                this.output('signal', value.signal, input.index),
            ],
        };
    }

    protected resetState(): void { this.kernel.reset(); }
    protected captureState(): MacdCheckpoint { return this.kernel.checkpoint(); }
    protected restoreState(state: MacdCheckpoint): void { this.kernel.restore(state); }
}

export class PercentagePriceOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    PercentagePriceOscillatorCheckpoint
> {
    private readonly short: FiniteExponentialAverage;
    private readonly long: FiniteExponentialAverage;
    private readonly signal: FiniteExponentialAverage;

    constructor(
        readonly shortLength: number,
        readonly longLength: number,
        readonly signalLength: number,
    ) {
        super(['ppo', 'signal', 'histogram']);
        integer(shortLength, shortLength, 2, 200, 'shortLength');
        integer(longLength, longLength, 2, 400, 'longLength');
        integer(signalLength, signalLength, 1, 100, 'signalLength');
        this.short = new FiniteExponentialAverage(shortLength);
        this.long = new FiniteExponentialAverage(longLength);
        this.signal = new FiniteExponentialAverage(signalLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        const short = commit ? this.short.push(close) : this.short.preview(close);
        const long = commit ? this.long.push(close) : this.long.preview(close);
        const ppo = short === null || long === null
            ? null
            : (long === 0 ? 0 : finite((short - long) / long * 100));
        const signal = commit ? this.signal.push(ppo) : this.signal.preview(ppo);
        const histogram = ppo === null || signal === null ? null : ppo - signal;
        return {
            isFormed: histogram !== null,
            values: [
                this.output('ppo', ppo, input.index),
                this.output('signal', signal, input.index),
                this.output('histogram', histogram, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.short.reset();
        this.long.reset();
        this.signal.reset();
    }

    protected captureState(): PercentagePriceOscillatorCheckpoint {
        return Object.freeze({
            short: this.short.checkpoint(),
            long: this.long.checkpoint(),
            signal: this.signal.checkpoint(),
        });
    }

    protected restoreState(state: PercentagePriceOscillatorCheckpoint): void {
        if (state === null || typeof state !== 'object') {
            throw new TypeError('sschart: invalid Percentage Price Oscillator checkpoint');
        }
        this.short.restore(state.short);
        this.long.restore(state.long);
        this.signal.restore(state.signal);
    }
}

export class SchaffTrendCycleProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    SchaffTrendCycleCheckpoint
> {
    private readonly macd: MacdKernel;
    private readonly closeHigh: RollingMaximum;
    private readonly closeLow: RollingMinimum;
    private readonly stochasticHigh: RollingMaximum;
    private readonly stochasticLow: RollingMinimum;
    private readonly average: FiniteExponentialAverage;
    private previousStochastic = 0;

    constructor(
        readonly length: number,
        readonly shortLength: number,
        readonly longLength: number,
        readonly cycleLength: number,
        readonly signalLength: number,
    ) {
        super(['line']);
        integer(length, length, 1, 500, 'length');
        integer(shortLength, shortLength, 1, 500, 'shortLength');
        integer(longLength, longLength, 1, 500, 'longLength');
        integer(cycleLength, cycleLength, 1, 500, 'cycleLength');
        integer(signalLength, signalLength, 1, 500, 'signalLength');
        this.macd = new MacdKernel(shortLength, longLength, signalLength);
        this.closeHigh = new RollingMaximum(length);
        this.closeLow = new RollingMinimum(length);
        this.stochasticHigh = new RollingMaximum(cycleLength);
        this.stochasticLow = new RollingMinimum(cycleLength);
        this.average = new FiniteExponentialAverage(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        let closeHigh: number | null;
        let closeLow: number | null;
        if (commit) {
            // StockSharp's DecimalBuffer skips invalid input instead of inserting a gap.
            if (close !== null) {
                this.closeHigh.push(close);
                this.closeLow.push(close);
            }
            closeHigh = this.closeHigh.partialValue;
            closeLow = this.closeLow.partialValue;
        } else if (close === null) {
            closeHigh = this.closeHigh.partialValue;
            closeLow = this.closeLow.partialValue;
        } else {
            closeHigh = this.closeHigh.previewPartial(close);
            closeLow = this.closeLow.previewPartial(close);
        }

        const macd = commit ? this.macd.push(close) : this.macd.preview(close);
        if (macd.histogram === null || closeHigh === null || closeLow === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }

        const closeRange = closeHigh - closeLow;
        let stochastic: number;
        let stochasticFormed: boolean;
        if (closeRange === 0) {
            // The C# implementation reuses the last %K and deliberately does not
            // advance the inner stochastic window in this branch.
            stochastic = this.previousStochastic;
            stochasticFormed = this.stochasticHigh.isFormed;
        } else {
            const raw = finite((macd.histogram - closeLow) / closeRange);
            if (raw === null) {
                return {
                    isFormed: false,
                    values: [this.output('line', null, input.index)],
                };
            }

            let stochasticHigh: number | null;
            let stochasticLow: number | null;
            if (commit) {
                this.stochasticHigh.push(raw);
                this.stochasticLow.push(raw);
                stochasticHigh = this.stochasticHigh.partialValue;
                stochasticLow = this.stochasticLow.partialValue;
                stochasticFormed = this.stochasticHigh.isFormed
                    && this.stochasticLow.isFormed;
            } else {
                stochasticHigh = this.stochasticHigh.previewPartial(raw);
                stochasticLow = this.stochasticLow.previewPartial(raw);
                stochasticFormed = this.stochasticHigh.preview(raw) !== null
                    && this.stochasticLow.preview(raw) !== null;
            }
            if (stochasticHigh === null || stochasticLow === null) {
                return {
                    isFormed: false,
                    values: [this.output('line', null, input.index)],
                };
            }
            const stochasticRange = stochasticHigh - stochasticLow;
            stochastic = stochasticRange === 0
                ? 0
                : 100 * (raw - stochasticLow) / stochasticRange;
        }

        if (!stochasticFormed) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }
        if (commit) this.previousStochastic = stochastic;
        const value = commit
            ? this.average.push(stochastic)
            : this.average.preview(stochastic);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.macd.reset();
        this.closeHigh.reset();
        this.closeLow.reset();
        this.stochasticHigh.reset();
        this.stochasticLow.reset();
        this.average.reset();
        this.previousStochastic = 0;
    }

    protected captureState(): SchaffTrendCycleCheckpoint {
        return Object.freeze({
            macd: this.macd.checkpoint(),
            closeHigh: this.closeHigh.checkpoint(),
            closeLow: this.closeLow.checkpoint(),
            stochasticHigh: this.stochasticHigh.checkpoint(),
            stochasticLow: this.stochasticLow.checkpoint(),
            average: this.average.checkpoint(),
            previousStochastic: this.previousStochastic,
        });
    }

    protected restoreState(state: SchaffTrendCycleCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.previousStochastic) === null) {
            throw new TypeError('sschart: invalid Schaff Trend Cycle checkpoint');
        }
        this.macd.restore(state.macd);
        this.closeHigh.restore(state.closeHigh);
        this.closeLow.restore(state.closeLow);
        this.stochasticHigh.restore(state.stochasticHigh);
        this.stochasticLow.restore(state.stochasticLow);
        this.average.restore(state.average);
        this.previousStochastic = state.previousStochastic;
    }
}

export interface StochasticParameters extends IndicatorParameters {
    readonly kPeriod: number;
    readonly dPeriod: number;
    readonly smooth: number;
}

export interface FastStochasticParameters extends IndicatorParameters {
    readonly kPeriod: number;
    readonly dPeriod: number;
}

export interface StochasticCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
    readonly k: RollingWindowCheckpoint;
    readonly d: RollingWindowCheckpoint;
}

export class StochasticProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    StochasticCheckpoint
> {
    private readonly high: RollingMaximum;
    private readonly low: RollingMinimum;
    private readonly k: SimpleMovingAverage;
    private readonly d: SimpleMovingAverage;

    constructor(
        readonly kPeriod: number,
        readonly dPeriod: number,
        readonly smooth: number,
    ) {
        super(['k', 'd']);
        this.high = new RollingMaximum(kPeriod);
        this.low = new RollingMinimum(kPeriod);
        this.k = new SimpleMovingAverage(smooth);
        this.d = new SimpleMovingAverage(dPeriod);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const currentHigh = finite(input.value?.high);
        const currentLow = finite(input.value?.low);
        const close = finite(input.value?.close);
        const high = commit ? this.high.push(currentHigh) : this.high.preview(currentHigh);
        const low = commit ? this.low.push(currentLow) : this.low.preview(currentLow);
        const range = high === null || low === null ? null : high - low;
        const fastK = range === null || close === null
            ? null
            : range === 0 ? 0 : 100 * (close - low!) / range;
        const k = commit ? this.k.push(fastK) : this.k.preview(fastK);
        const d = commit ? this.d.push(k) : this.d.preview(k);
        return {
            isFormed: d !== null,
            values: [
                this.output('k', k, input.index),
                this.output('d', d, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.high.reset();
        this.low.reset();
        this.k.reset();
        this.d.reset();
    }
    protected captureState(): StochasticCheckpoint {
        return Object.freeze({
            high: this.high.checkpoint(),
            low: this.low.checkpoint(),
            k: this.k.checkpoint(),
            d: this.d.checkpoint(),
        });
    }
    protected restoreState(state: StochasticCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || state.high?.values?.length !== state.low?.values?.length) {
            throw new TypeError('sschart: invalid stochastic checkpoint');
        }
        this.high.restore(state.high);
        this.low.restore(state.low);
        this.k.restore(state.k);
        this.d.restore(state.d);
    }
}

export class FastStochasticProcessor extends StochasticProcessor {
    constructor(kPeriod: number, dPeriod: number) {
        super(kPeriod, dPeriod, 1);
    }
}

export const PivotPointsIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'PivotPoints',
    name: 'Pivot Points',
    description: 'Classic pivot, resistance and support levels calculated from each candle.',
    category: IndicatorCategory.SupportResistance,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [
        { id: 'pp', name: 'Pivot Point', defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28', 2) },
        { id: 'r1', name: 'Resistance 1', defaultStyle: style(IndicatorSeriesStyle.Line, '#ef5350') },
        { id: 'r2', name: 'Resistance 2', defaultStyle: style(IndicatorSeriesStyle.Line, '#e53935') },
        { id: 's1', name: 'Support 1', defaultStyle: style(IndicatorSeriesStyle.Line, '#66bb6a') },
        { id: 's2', name: 'Support 2', defaultStyle: style(IndicatorSeriesStyle.Line, '#43a047') },
    ],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: () => new PivotPointsProcessor(),
});

export const RelativeVigorIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    RelativeVigorIndexParameters
> = registerIndicator({
    id: 'RelativeVigorIndex',
    name: 'RVI',
    description: 'Weighted close-open vigor relative to candle range with a signal line.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Average Length', type: IndicatorParameterType.Integer,
            defaultValue: 4, min: 4, max: 200, step: 1,
        },
        {
            id: 'signalLength', name: 'Signal Length', type: IndicatorParameterType.Integer,
            defaultValue: 4, min: 4, max: 100, step: 1,
        },
    ],
    outputs: [
        { id: 'rvi', name: 'RVI', defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2) },
        { id: 'signal', name: 'Signal', defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28') },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new RelativeVigorIndexProcessor(
        integer(parameters?.length, 4, 4, 200, 'length'),
        integer(parameters?.signalLength, 4, 4, 100, 'signalLength'),
    ),
});

export const BollingerBandsIndicator: IndicatorDefinition<
    IndicatorCandle,
    BollingerBandsParameters
> = registerIndicator({
    id: 'BollingerBands',
    name: 'Bollinger Bands',
    description: 'Moving-average envelope at a configurable population standard deviation.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 20, min: 2, max: 500, step: 1,
        },
        {
            id: 'stdDev', name: 'Deviation', type: IndicatorParameterType.Number,
            defaultValue: 2, min: 0.1, max: 5, step: 0.1,
        },
    ],
    outputs: [
        { id: 'upper', name: 'Upper', defaultStyle: style(IndicatorSeriesStyle.Band, '#42a5f5') },
        { id: 'middle', name: 'Middle', defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28', 2) },
        { id: 'lower', name: 'Lower', defaultStyle: style(IndicatorSeriesStyle.Band, '#42a5f5') },
    ],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new BollingerBandsProcessor(
        integer(parameters?.length, 20, 2, 500, 'length'),
        number(parameters?.stdDev, 2, 0.1, 5, 'stdDev'),
    ),
});

export const PriceChannelsIndicator: IndicatorDefinition<
    IndicatorCandle,
    CompoundLengthParameters
> = registerIndicator({
    id: 'PriceChannels',
    name: 'Price Channels',
    description: 'Trailing highest-high and lowest-low price channel.',
    category: IndicatorCategory.SupportResistance,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 20, min: 1, max: 500, step: 1,
    }],
    outputs: [
        {
            id: 'upper', name: 'Upper',
            defaultStyle: style(IndicatorSeriesStyle.Band, '#42a5f5'),
        },
        {
            id: 'lower', name: 'Lower',
            defaultStyle: style(IndicatorSeriesStyle.Band, '#42a5f5'),
        },
    ],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new PriceChannelsProcessor(
        integer(parameters?.length, 20, 1, 500, 'length'),
    ),
});

export const DonchianChannelsIndicator: IndicatorDefinition<
    IndicatorCandle,
    CompoundLengthParameters
> = registerIndicator({
    id: 'DonchianChannels',
    name: 'Donchian Channels',
    description: 'Rolling highest-high and lowest-low channel with its midpoint.',
    category: IndicatorCategory.SupportResistance,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 20, min: 1, max: 500, step: 1,
    }],
    outputs: [
        { id: 'upper', name: 'Upper', defaultStyle: style(IndicatorSeriesStyle.Band, '#42a5f5') },
        { id: 'middle', name: 'Middle', defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28', 2) },
        { id: 'lower', name: 'Lower', defaultStyle: style(IndicatorSeriesStyle.Band, '#42a5f5') },
    ],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new DonchianChannelsProcessor(
        integer(parameters?.length, 20, 1, 500, 'length'),
    ),
});

export const DetrendedSyntheticPriceIndicator: IndicatorDefinition<
    IndicatorCandle,
    CompoundLengthParameters
> = registerIndicator({
    id: 'DetrendedSyntheticPrice',
    name: 'Detrended Synthetic Price',
    description: 'Midpoint of the rolling highest high and lowest low.',
    category: IndicatorCategory.Price,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 14, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line', name: 'Detrended Synthetic Price',
        defaultStyle: style(IndicatorSeriesStyle.Line, '#ffb74d', 2),
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new DetrendedSyntheticPriceProcessor(
        integer(parameters?.length, 14, 1, 500, 'length'),
    ),
});

export const TrueStrengthIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    TrueStrengthIndexParameters
> = registerIndicator({
    id: 'TrueStrengthIndex',
    name: 'True Strength Index',
    description: 'Double-smoothed momentum oscillator with an EMA signal line.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'firstLength', name: 'First Length', type: IndicatorParameterType.Integer,
            defaultValue: 25, min: 1, max: 500, step: 1,
        },
        {
            id: 'secondLength', name: 'Second Length', type: IndicatorParameterType.Integer,
            defaultValue: 13, min: 1, max: 500, step: 1,
        },
        {
            id: 'signalLength', name: 'Signal Length', type: IndicatorParameterType.Integer,
            defaultValue: 7, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [
        { id: 'tsi', name: 'TSI', defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2) },
        { id: 'signal', name: 'Signal', defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28') },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new TrueStrengthIndexProcessor(
        integer(parameters?.firstLength, 25, 1, 500, 'firstLength'),
        integer(parameters?.secondLength, 13, 1, 500, 'secondLength'),
        integer(parameters?.signalLength, 7, 1, 500, 'signalLength'),
    ),
});

export const WaveTrendOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    WaveTrendOscillatorParameters
> = registerIndicator({
    id: 'WaveTrendOscillator',
    name: 'Wave Trend Oscillator',
    description: 'Dual-line momentum oscillator derived from smoothed typical-price deviation.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'esaPeriod', name: 'ESA Period', type: IndicatorParameterType.Integer,
            defaultValue: 10, min: 1, max: 500, step: 1,
        },
        {
            id: 'dPeriod', name: 'Deviation Period', type: IndicatorParameterType.Integer,
            defaultValue: 14, min: 1, max: 500, step: 1,
        },
        {
            id: 'averagePeriod', name: 'Average Period',
            type: IndicatorParameterType.Integer,
            defaultValue: 3, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [
        { id: 'wt1', name: 'WT1', defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2) },
        { id: 'wt2', name: 'WT2', defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28') },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new WaveTrendOscillatorProcessor(
        integer(parameters?.esaPeriod, 10, 1, 500, 'esaPeriod'),
        integer(parameters?.dPeriod, 14, 1, 500, 'dPeriod'),
        integer(parameters?.averagePeriod, 3, 1, 500, 'averagePeriod'),
    ),
});

export const WoodiesCciIndicator: IndicatorDefinition<
    IndicatorCandle,
    WoodiesCciParameters
> = registerIndicator({
    id: 'WoodiesCCI',
    name: 'Woodies CCI',
    description: 'Commodity Channel Index with a sequential simple-average signal line.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'CCI Length', type: IndicatorParameterType.Integer,
            defaultValue: 14, min: 1, max: 500, step: 1,
        },
        {
            id: 'smaLength', name: 'Signal Length', type: IndicatorParameterType.Integer,
            defaultValue: 6, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [
        { id: 'cci', name: 'CCI', defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2) },
        { id: 'signal', name: 'Signal', defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28') },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new WoodiesCciProcessor(
        integer(parameters?.length, 14, 1, 500, 'length'),
        integer(parameters?.smaLength, 6, 1, 500, 'smaLength'),
    ),
});

export const KeltnerChannelsIndicator: IndicatorDefinition<
    IndicatorCandle,
    KeltnerChannelsParameters
> = registerIndicator({
    id: 'KeltnerChannels',
    name: 'Keltner Channels',
    description: 'EMA center line surrounded by Average True Range channel boundaries.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 20, min: 1, max: 500, step: 1,
        },
        {
            id: 'multiplier', name: 'Multiplier', type: IndicatorParameterType.Number,
            defaultValue: 2, min: 0.000001, max: 500, step: 0.1,
        },
    ],
    outputs: [
        { id: 'upper', name: 'Upper', defaultStyle: style(IndicatorSeriesStyle.Line, '#ef5350') },
        { id: 'middle', name: 'Middle', defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2) },
        { id: 'lower', name: 'Lower', defaultStyle: style(IndicatorSeriesStyle.Line, '#26a69a') },
    ],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new KeltnerChannelsProcessor(
        integer(parameters?.length, 20, 1, 500, 'length'),
        number(parameters?.multiplier, 2, 0.000001, 500, 'multiplier'),
    ),
});

export const KasePeakOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    KasePeakOscillatorParameters
> = registerIndicator({
    id: 'KasePeakOscillator',
    name: 'Kase Peak Oscillator',
    description: 'Short- and long-term price position inside ATR-adjusted peak and valley ranges.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'atrLength', name: 'ATR Length', type: IndicatorParameterType.Integer,
            defaultValue: 10, min: 1, max: 500, step: 1,
        },
        {
            id: 'shortPeriod', name: 'Short Period', type: IndicatorParameterType.Integer,
            defaultValue: 9, min: 1, max: 500, step: 1,
        },
        {
            id: 'longPeriod', name: 'Long Period', type: IndicatorParameterType.Integer,
            defaultValue: 18, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [
        {
            id: 'shortTerm', name: 'Short Term',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2),
        },
        {
            id: 'longTerm', name: 'Long Term',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28'),
        },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new KasePeakOscillatorProcessor(
        integer(parameters?.atrLength, 10, 1, 500, 'atrLength'),
        integer(parameters?.shortPeriod, 9, 1, 500, 'shortPeriod'),
        integer(parameters?.longPeriod, 18, 1, 500, 'longPeriod'),
    ),
});

export const KnowSureThingIndicator: IndicatorDefinition<
    IndicatorCandle,
    KnowSureThingParameters
> = registerIndicator({
    id: 'KnowSureThing',
    name: 'Know Sure Thing',
    description: 'Weighted composite of four smoothed rates of change with a signal average.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        { id: 'roc1Length', name: 'ROC 1 Length', type: IndicatorParameterType.Integer, defaultValue: 10, min: 1, max: 500, step: 1 },
        { id: 'roc2Length', name: 'ROC 2 Length', type: IndicatorParameterType.Integer, defaultValue: 15, min: 1, max: 500, step: 1 },
        { id: 'roc3Length', name: 'ROC 3 Length', type: IndicatorParameterType.Integer, defaultValue: 20, min: 1, max: 500, step: 1 },
        { id: 'roc4Length', name: 'ROC 4 Length', type: IndicatorParameterType.Integer, defaultValue: 30, min: 1, max: 500, step: 1 },
        { id: 'sma1Length', name: 'SMA 1 Length', type: IndicatorParameterType.Integer, defaultValue: 10, min: 1, max: 500, step: 1 },
        { id: 'sma2Length', name: 'SMA 2 Length', type: IndicatorParameterType.Integer, defaultValue: 10, min: 1, max: 500, step: 1 },
        { id: 'sma3Length', name: 'SMA 3 Length', type: IndicatorParameterType.Integer, defaultValue: 10, min: 1, max: 500, step: 1 },
        { id: 'sma4Length', name: 'SMA 4 Length', type: IndicatorParameterType.Integer, defaultValue: 15, min: 1, max: 500, step: 1 },
        { id: 'signalLength', name: 'Signal Length', type: IndicatorParameterType.Integer, defaultValue: 9, min: 1, max: 500, step: 1 },
    ],
    outputs: [
        {
            id: 'kst', name: 'KST',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2),
        },
        {
            id: 'signal', name: 'Signal',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28'),
        },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new KnowSureThingProcessor(
        integer(parameters?.roc1Length, 10, 1, 500, 'roc1Length'),
        integer(parameters?.roc2Length, 15, 1, 500, 'roc2Length'),
        integer(parameters?.roc3Length, 20, 1, 500, 'roc3Length'),
        integer(parameters?.roc4Length, 30, 1, 500, 'roc4Length'),
        integer(parameters?.sma1Length, 10, 1, 500, 'sma1Length'),
        integer(parameters?.sma2Length, 10, 1, 500, 'sma2Length'),
        integer(parameters?.sma3Length, 10, 1, 500, 'sma3Length'),
        integer(parameters?.sma4Length, 15, 1, 500, 'sma4Length'),
        integer(parameters?.signalLength, 9, 1, 500, 'signalLength'),
    ),
});

export const KlingerVolumeOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    KlingerVolumeOscillatorParameters
> = registerIndicator({
    id: 'KlingerVolumeOscillator',
    name: 'Klinger Volume Oscillator',
    description: 'Difference between short and long averages of direction-signed candle volume.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortPeriod', name: 'Short Period', type: IndicatorParameterType.Integer,
            defaultValue: 34, min: 1, max: 500, step: 1,
        },
        {
            id: 'longPeriod', name: 'Long Period', type: IndicatorParameterType.Integer,
            defaultValue: 55, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [
        {
            id: 'shortEma', name: 'Short EMA',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5'),
        },
        {
            id: 'longEma', name: 'Long EMA',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28'),
        },
        {
            id: 'oscillator', name: 'Oscillator',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#ab47bc', 2),
        },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Volume,
    processorFactory: (parameters) => new KlingerVolumeOscillatorProcessor(
        integer(parameters?.shortPeriod, 34, 1, 500, 'shortPeriod'),
        integer(parameters?.longPeriod, 55, 1, 500, 'longPeriod'),
    ),
});

export const MovingAverageCrossoverIndicator: IndicatorDefinition<
    IndicatorCandle,
    MovingAverageCrossoverParameters
> = registerIndicator({
    id: 'MovingAverageCrossover',
    name: 'Moving Average Crossover',
    description: 'Sign of the difference between fast and slow simple moving averages.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortPeriod', name: 'Short Period', type: IndicatorParameterType.Integer,
            defaultValue: 25, min: 1, max: 500, step: 1,
        },
        {
            id: 'longPeriod', name: 'Long Period', type: IndicatorParameterType.Integer,
            defaultValue: 50, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'signal', name: 'Signal',
        defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new MovingAverageCrossoverProcessor(
        integer(parameters?.shortPeriod, 25, 1, 500, 'shortPeriod'),
        integer(parameters?.longPeriod, 50, 1, 500, 'longPeriod'),
    ),
});

export const MovingAverageRibbonIndicator: IndicatorDefinition<
    IndicatorCandle,
    MovingAverageRibbonParameters
> = registerIndicator({
    id: 'MovingAverageRibbon',
    name: 'Moving Average Ribbon',
    description: 'Parameter-sized sequence of cascaded simple moving averages.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortPeriod', name: 'Short Period', type: IndicatorParameterType.Integer,
            defaultValue: 10, min: 1, max: 500, step: 1,
        },
        {
            id: 'longPeriod', name: 'Long Period', type: IndicatorParameterType.Integer,
            defaultValue: 100, min: 1, max: 1_000, step: 1,
        },
        {
            id: 'ribbonCount', name: 'Ribbon Count', type: IndicatorParameterType.Integer,
            defaultValue: 10, min: 2, max: 500, step: 1,
        },
    ],
    outputs: DEFAULT_MOVING_AVERAGE_RIBBON_OUTPUTS,
    outputFactory: movingAverageRibbonOutputs,
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new MovingAverageRibbonProcessor(
        integer(parameters?.shortPeriod, 10, 1, 500, 'shortPeriod'),
        integer(parameters?.longPeriod, 100, 1, 1_000, 'longPeriod'),
        integer(parameters?.ribbonCount, 10, 2, 500, 'ribbonCount'),
    ),
});

export const RainbowChartsIndicator: IndicatorDefinition<
    IndicatorCandle,
    RainbowChartsParameters
> = registerIndicator({
    id: 'RainbowCharts',
    name: 'Rainbow Charts',
    description: 'A configurable fan of independent even-period simple moving averages.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'lines', name: 'Lines', type: IndicatorParameterType.Integer,
        defaultValue: 10, min: 2, max: 500, step: 1,
    }],
    outputs: DEFAULT_RAINBOW_CHARTS_OUTPUTS,
    outputFactory: rainbowChartsOutputs,
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new RainbowChartsProcessor(
        integer(parameters?.lines, 10, 2, 500, 'lines'),
    ),
});

export const McClellanOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    McClellanOscillatorParameters
> = registerIndicator({
    id: 'McClellanOscillator',
    name: 'McClellan Oscillator',
    description: 'Difference between short and long exponential moving averages.',
    category: IndicatorCategory.MarketStrength,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortLength', name: 'Short Length', type: IndicatorParameterType.Integer,
            defaultValue: 19, min: 1, max: 500, step: 1,
        },
        {
            id: 'longLength', name: 'Long Length', type: IndicatorParameterType.Integer,
            defaultValue: 39, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'line', name: 'McClellan Oscillator',
        defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new McClellanOscillatorProcessor(
        integer(parameters?.shortLength, 19, 1, 500, 'shortLength'),
        integer(parameters?.longLength, 39, 1, 500, 'longLength'),
    ),
});

export const EnvelopeIndicator: IndicatorDefinition<
    IndicatorCandle,
    EnvelopeParameters
> = registerIndicator({
    id: 'Envelope',
    name: 'Envelope',
    description: 'Simple moving average with fixed percentage upper and lower bands.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 20, min: 2, max: 500, step: 1,
        },
        {
            id: 'percent', name: 'Percent', type: IndicatorParameterType.Number,
            defaultValue: 2.5, min: 0.1, max: 20, step: 0.1,
        },
    ],
    outputs: [
        { id: 'upper', name: 'Upper', defaultStyle: style(IndicatorSeriesStyle.Band, '#26a69a') },
        { id: 'middle', name: 'Middle', defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28', 2) },
        { id: 'lower', name: 'Lower', defaultStyle: style(IndicatorSeriesStyle.Band, '#26a69a') },
    ],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new EnvelopeProcessor(
        integer(parameters?.length, 20, 2, 500, 'length'),
        number(parameters?.percent, 2.5, 0.1, 20, 'percent'),
    ),
});

export const AwesomeOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    AwesomeOscillatorParameters
> = registerIndicator({
    id: 'AwesomeOscillator',
    name: 'Awesome Oscillator',
    description: 'Difference between short and long moving averages of median price.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortLength', name: 'Short Length', type: IndicatorParameterType.Integer,
            defaultValue: 5, min: 1, max: 500, step: 1,
        },
        {
            id: 'longLength', name: 'Long Length', type: IndicatorParameterType.Integer,
            defaultValue: 34, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'value',
        name: 'Awesome Oscillator',
        defaultStyle: style(IndicatorSeriesStyle.Histogram, '#00c853'),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: (parameters) => new AwesomeOscillatorProcessor(
        integer(parameters?.shortLength, 5, 1, 500, 'shortLength'),
        integer(parameters?.longLength, 34, 1, 500, 'longLength'),
    ),
});

export const ElliotWaveOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    ElliotWaveOscillatorParameters
> = registerIndicator({
    id: 'ElliotWaveOscillator',
    name: 'Elliot Wave Oscillator',
    description: 'Difference between short and long simple averages of closing price.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortPeriod', name: 'Short Period', type: IndicatorParameterType.Integer,
            defaultValue: 5, min: 1, max: 500, step: 1,
        },
        {
            id: 'longPeriod', name: 'Long Period', type: IndicatorParameterType.Integer,
            defaultValue: 34, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'line',
        name: 'Elliot Wave Oscillator',
        defaultStyle: style(IndicatorSeriesStyle.Line, '#26a69a', 2),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: (parameters) => new ElliotWaveOscillatorProcessor(
        integer(parameters?.shortPeriod, 5, 1, 500, 'shortPeriod'),
        integer(parameters?.longPeriod, 34, 1, 500, 'longPeriod'),
    ),
});

export const GuppyMultipleMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'GuppyMultipleMovingAverage',
    name: 'Guppy Multiple Moving Average',
    description: 'Six short-term and six long-term exponential moving averages.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [
        ...GMMA_SHORT_LENGTHS.map((length, index) => ({
            id: `short${length}`,
            name: `Short EMA ${length}`,
            defaultStyle: style(
                IndicatorSeriesStyle.Line,
                ['#80deea', '#4dd0e1', '#26c6da', '#00acc1', '#0097a7', '#00838f'][index],
            ),
        })),
        ...GMMA_LONG_LENGTHS.map((length, index) => ({
            id: `long${length}`,
            name: `Long EMA ${length}`,
            defaultStyle: style(
                IndicatorSeriesStyle.Line,
                ['#ffcc80', '#ffb74d', '#ffa726', '#fb8c00', '#f57c00', '#ef6c00'][index],
            ),
        })),
    ],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: () => new GuppyMultipleMovingAverageProcessor(),
});

export const AccelerationIndicator: IndicatorDefinition<
    IndicatorCandle,
    AccelerationParameters
> = registerIndicator({
    id: 'Acceleration',
    name: 'Acceleration',
    description: 'Awesome Oscillator displacement from its own moving average.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortLength', name: 'Short Length', type: IndicatorParameterType.Integer,
            defaultValue: 5, min: 1, max: 500, step: 1,
        },
        {
            id: 'longLength', name: 'Long Length', type: IndicatorParameterType.Integer,
            defaultValue: 34, min: 1, max: 500, step: 1,
        },
        {
            id: 'smaLength', name: 'Average Length', type: IndicatorParameterType.Integer,
            defaultValue: 5, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{ id: 'line', name: 'Acceleration', defaultStyle: style(IndicatorSeriesStyle.Line, '#ff7043', 2) }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: (parameters) => new AccelerationProcessor(
        integer(parameters?.shortLength, 5, 1, 500, 'shortLength'),
        integer(parameters?.longLength, 34, 1, 500, 'longLength'),
        integer(parameters?.smaLength, 5, 1, 500, 'smaLength'),
    ),
});

export const TrixIndicator: IndicatorDefinition<
    IndicatorCandle,
    CompoundLengthParameters
> = registerIndicator({
    id: 'Trix',
    name: 'Trix',
    description: 'StockSharp-scaled one-bar rate of change of a triple-smoothed EMA.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 14, min: 1, max: 500, step: 1,
    }],
    outputs: [{ id: 'line', name: 'Trix', defaultStyle: style(IndicatorSeriesStyle.Line, '#ab47bc', 2) }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new TrixProcessor(
        integer(parameters?.length, 14, 1, 500, 'length'),
    ),
});

export const DoubleExponentialMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    CompoundLengthParameters
> = registerIndicator({
    id: 'DoubleExponentialMovingAverage',
    name: 'Double Exponential Moving Average',
    description: 'Mulloy double EMA that removes most of a single EMA lag.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 32, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'DEMA',
        defaultStyle: style(IndicatorSeriesStyle.Line, '#29b6f6', 2),
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new DoubleExponentialMovingAverageProcessor(
        integer(parameters?.length, 32, 1, 500, 'length'),
    ),
});

export const TripleExponentialMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    CompoundLengthParameters
> = registerIndicator({
    id: 'TripleExponentialMovingAverage',
    name: 'Triple Exponential Moving Average',
    description: 'Mulloy triple EMA cascade that further reduces smoothing lag.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
        defaultValue: 32, min: 1, max: 500, step: 1,
    }],
    outputs: [{
        id: 'line',
        name: 'TEMA',
        defaultStyle: style(IndicatorSeriesStyle.Line, '#ec407a', 2),
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new TripleExponentialMovingAverageProcessor(
        integer(parameters?.length, 32, 1, 500, 'length'),
    ),
});

export const T3MovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    T3MovingAverageParameters
> = registerIndicator({
    id: 'T3MovingAverage',
    name: 'T3 Moving Average',
    description: 'Tillson six-stage exponential moving average with configurable volume factor.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 5, min: 1, max: 500, step: 1,
        },
        {
            id: 'volumeFactor', name: 'Volume Factor', type: IndicatorParameterType.Number,
            defaultValue: 0.7, min: 0.000001, max: 0.999999, step: 0.001,
        },
    ],
    outputs: [{
        id: 'line',
        name: 'T3',
        defaultStyle: style(IndicatorSeriesStyle.Line, '#26a69a', 2),
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new T3MovingAverageProcessor(
        integer(parameters?.length, 5, 1, 500, 'length'),
        number(parameters?.volumeFactor, 0.7, 0.000001, 0.999999, 'volumeFactor'),
    ),
});

export const HullMovingAverageIndicator: IndicatorDefinition<
    IndicatorCandle,
    HullMovingAverageParameters
> = registerIndicator({
    id: 'HullMovingAverage',
    name: 'Hull Moving Average',
    description: 'Hull cascade of fast, slow and result linear weighted averages.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 10, min: 1, max: 500, step: 1,
        },
        {
            id: 'sqrtPeriod', name: 'Result Period', type: IndicatorParameterType.Integer,
            defaultValue: 0, min: 0, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'line',
        name: 'HMA',
        defaultStyle: style(IndicatorSeriesStyle.Line, '#66bb6a', 2),
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new HullMovingAverageProcessor(
        integer(parameters?.length, 10, 1, 500, 'length'),
        integer(parameters?.sqrtPeriod, 0, 0, 500, 'sqrtPeriod'),
    ),
});

export const MacdIndicator: IndicatorDefinition<
    IndicatorCandle,
    MacdParameters
> = registerIndicator({
    id: 'MovingAverageConvergenceDivergence',
    name: 'MACD',
    description: 'Difference of fast and slow EMA with signal EMA and histogram.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'fastLength', name: 'Fast Length', type: IndicatorParameterType.Integer,
            defaultValue: 12, min: 2, max: 200, step: 1,
        },
        {
            id: 'slowLength', name: 'Slow Length', type: IndicatorParameterType.Integer,
            defaultValue: 26, min: 2, max: 400, step: 1,
        },
        {
            id: 'signalLength', name: 'Signal Length', type: IndicatorParameterType.Integer,
            defaultValue: 9, min: 1, max: 100, step: 1,
        },
    ],
    outputs: [
        { id: 'macd', name: 'MACD', defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2) },
        { id: 'signal', name: 'Signal', defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28') },
        { id: 'histogram', name: 'Histogram', defaultStyle: style(IndicatorSeriesStyle.Histogram, '#ab47bc') },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: (parameters) => new MacdProcessor(
        integer(parameters?.fastLength, 12, 2, 200, 'fastLength'),
        integer(parameters?.slowLength, 26, 2, 400, 'slowLength'),
        integer(parameters?.signalLength, 9, 1, 100, 'signalLength'),
    ),
});

export const MacdSignalIndicator: IndicatorDefinition<
    IndicatorCandle,
    MacdSignalParameters
> = registerIndicator({
    id: 'MovingAverageConvergenceDivergenceSignal',
    name: 'Moving Average Convergence Divergence Signal',
    description: 'MACD and its exponential signal line as a two-value composite.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'longLength', name: 'Long Length', type: IndicatorParameterType.Integer,
            defaultValue: 26, min: 1, max: 500, step: 1,
        },
        {
            id: 'shortLength', name: 'Short Length', type: IndicatorParameterType.Integer,
            defaultValue: 12, min: 1, max: 500, step: 1,
        },
        {
            id: 'signalLength', name: 'Signal Length', type: IndicatorParameterType.Integer,
            defaultValue: 9, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [
        {
            id: 'macd', name: 'MACD',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2),
        },
        {
            id: 'signal', name: 'Signal',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28'),
        },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new MacdSignalProcessor(
        integer(parameters?.longLength, 26, 1, 500, 'longLength'),
        integer(parameters?.shortLength, 12, 1, 500, 'shortLength'),
        integer(parameters?.signalLength, 9, 1, 500, 'signalLength'),
    ),
});

export const PercentagePriceOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    PercentagePriceOscillatorParameters
> = registerIndicator({
    id: 'PercentagePriceOscillator',
    name: 'PPO',
    description: 'Percentage difference between short and long EMA with signal and histogram.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortLength', name: 'Short Length', type: IndicatorParameterType.Integer,
            defaultValue: 12, min: 2, max: 200, step: 1,
        },
        {
            id: 'longLength', name: 'Long Length', type: IndicatorParameterType.Integer,
            defaultValue: 26, min: 2, max: 400, step: 1,
        },
        {
            id: 'signalLength', name: 'Signal Length', type: IndicatorParameterType.Integer,
            defaultValue: 9, min: 1, max: 100, step: 1,
        },
    ],
    outputs: [
        { id: 'ppo', name: 'PPO', defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2) },
        { id: 'signal', name: 'Signal', defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28') },
        {
            id: 'histogram', name: 'Histogram',
            defaultStyle: style(IndicatorSeriesStyle.Histogram, '#ab47bc'),
        },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new PercentagePriceOscillatorProcessor(
        integer(parameters?.shortLength, 12, 2, 200, 'shortLength'),
        integer(parameters?.longLength, 26, 2, 400, 'longLength'),
        integer(parameters?.signalLength, 9, 1, 100, 'signalLength'),
    ),
});

export const SchaffTrendCycleIndicator: IndicatorDefinition<
    IndicatorCandle,
    SchaffTrendCycleParameters
> = registerIndicator({
    id: 'SchaffTrendCycle',
    name: 'Schaff Trend Cycle',
    description: 'MACD histogram transformed by StockSharp stochastic-cycle logic and EMA smoothing.',
    category: IndicatorCategory.Cycle,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 10, min: 1, max: 500, step: 1,
        },
        {
            id: 'shortLength', name: 'Short Length', type: IndicatorParameterType.Integer,
            defaultValue: 23, min: 1, max: 500, step: 1,
        },
        {
            id: 'longLength', name: 'Long Length', type: IndicatorParameterType.Integer,
            defaultValue: 50, min: 1, max: 500, step: 1,
        },
        {
            id: 'cycleLength', name: 'Cycle Length', type: IndicatorParameterType.Integer,
            defaultValue: 5, min: 1, max: 500, step: 1,
        },
        {
            id: 'signalLength', name: 'Signal Length', type: IndicatorParameterType.Integer,
            defaultValue: 3, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'line',
        name: 'STC',
        defaultStyle: style(IndicatorSeriesStyle.Line, '#26c6da', 2),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new SchaffTrendCycleProcessor(
        integer(parameters?.length, 10, 1, 500, 'length'),
        integer(parameters?.shortLength, 23, 1, 500, 'shortLength'),
        integer(parameters?.longLength, 50, 1, 500, 'longLength'),
        integer(parameters?.cycleLength, 5, 1, 500, 'cycleLength'),
        integer(parameters?.signalLength, 3, 1, 500, 'signalLength'),
    ),
});

export const StochasticIndicator: IndicatorDefinition<
    IndicatorCandle,
    StochasticParameters
> = registerIndicator({
    id: 'StochasticOscillator',
    name: 'Stochastic',
    description: 'Smoothed close position inside the rolling high-low range.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'kPeriod', name: 'K Period', type: IndicatorParameterType.Integer,
            defaultValue: 14, min: 1, max: 200, step: 1,
        },
        {
            id: 'dPeriod', name: 'D Period', type: IndicatorParameterType.Integer,
            defaultValue: 3, min: 1, max: 100, step: 1,
        },
        {
            id: 'smooth', name: 'Smoothing', type: IndicatorParameterType.Integer,
            defaultValue: 3, min: 1, max: 100, step: 1,
        },
    ],
    outputs: [
        { id: 'k', name: '%K', defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2) },
        { id: 'd', name: '%D', defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28') },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new StochasticProcessor(
        integer(parameters?.kPeriod, 14, 1, 200, 'kPeriod'),
        integer(parameters?.dPeriod, 3, 1, 100, 'dPeriod'),
        integer(parameters?.smooth, 3, 1, 100, 'smooth'),
    ),
});

export const FastStochasticIndicator: IndicatorDefinition<
    IndicatorCandle,
    FastStochasticParameters
> = registerIndicator({
    id: 'FastStochastic',
    name: 'Fast Stochastic',
    description: 'Raw stochastic %K with a simple moving average %D signal.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'kPeriod', name: 'K Period', type: IndicatorParameterType.Integer,
            defaultValue: 14, min: 1, max: 500, step: 1,
        },
        {
            id: 'dPeriod', name: 'D Period', type: IndicatorParameterType.Integer,
            defaultValue: 3, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [
        { id: 'k', name: '%K', defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2) },
        { id: 'd', name: '%D', defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28') },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new FastStochasticProcessor(
        integer(parameters?.kPeriod, 14, 1, 500, 'kPeriod'),
        integer(parameters?.dPeriod, 3, 1, 500, 'dPeriod'),
    ),
});

export const BollingerPercentBIndicator: IndicatorDefinition<
    IndicatorCandle,
    BollingerPercentBParameters
> = registerIndicator({
    id: 'BollingerPercentB',
    name: 'Bollinger Percent B',
    description: 'Price position inside the Bollinger envelope expressed in percent units.',
    category: IndicatorCategory.Volatility,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 20, min: 1, max: 500, step: 1,
        },
        {
            id: 'stdDevMultiplier', name: 'Standard Deviation Multiplier',
            type: IndicatorParameterType.Number,
            defaultValue: 2, min: 1, max: 500, step: 0.1,
        },
    ],
    outputs: [{
        id: 'line', name: '%B',
        defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new BollingerPercentBProcessor(
        integer(parameters?.length, 20, 1, 500, 'length'),
        number(parameters?.stdDevMultiplier, 2, 1, 500, 'stdDevMultiplier'),
    ),
});

export const ConstanceBrownCompositeIndexIndicator: IndicatorDefinition<
    IndicatorCandle,
    ConstanceBrownCompositeIndexParameters
> = registerIndicator({
    id: 'ConstanceBrownCompositeIndex',
    name: 'Constance Brown Composite Index',
    description: 'RSI rate of change plus short-RSI momentum with fast and slow signal averages.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'rsiLength', name: 'RSI Length', type: IndicatorParameterType.Integer,
            defaultValue: 14, min: 1, max: 500, step: 1,
        },
        {
            id: 'rocLength', name: 'ROC Length', type: IndicatorParameterType.Integer,
            defaultValue: 9, min: 1, max: 500, step: 1,
        },
        {
            id: 'shortRsiLength', name: 'Short RSI Length',
            type: IndicatorParameterType.Integer,
            defaultValue: 3, min: 1, max: 500, step: 1,
        },
        {
            id: 'momentumLength', name: 'Momentum Length',
            type: IndicatorParameterType.Integer,
            defaultValue: 3, min: 1, max: 500, step: 1,
        },
        {
            id: 'fastSmaLength', name: 'Fast SMA Length',
            type: IndicatorParameterType.Integer,
            defaultValue: 13, min: 1, max: 500, step: 1,
        },
        {
            id: 'slowSmaLength', name: 'Slow SMA Length',
            type: IndicatorParameterType.Integer,
            defaultValue: 33, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [
        {
            id: 'composite', name: 'Composite',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2),
        },
        {
            id: 'fastSma', name: 'Fast SMA',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28'),
        },
        {
            id: 'slowSma', name: 'Slow SMA',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#ef5350'),
        },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new ConstanceBrownCompositeIndexProcessor(
        integer(parameters?.rsiLength, 14, 1, 500, 'rsiLength'),
        integer(parameters?.rocLength, 9, 1, 500, 'rocLength'),
        integer(parameters?.shortRsiLength, 3, 1, 500, 'shortRsiLength'),
        integer(parameters?.momentumLength, 3, 1, 500, 'momentumLength'),
        integer(parameters?.fastSmaLength, 13, 1, 500, 'fastSmaLength'),
        integer(parameters?.slowSmaLength, 33, 1, 500, 'slowSmaLength'),
    ),
});

export const CompositeMomentumIndicator: IndicatorDefinition<
    IndicatorCandle,
    CompositeMomentumParameters
> = registerIndicator({
    id: 'CompositeMomentum',
    name: 'Composite Momentum',
    description: 'Normalized short and long ROC, RSI and EMA spread with an SMA signal.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'shortRocLength', name: 'Short ROC Length',
            type: IndicatorParameterType.Integer,
            defaultValue: 14, min: 1, max: 500, step: 1,
        },
        {
            id: 'longRocLength', name: 'Long ROC Length',
            type: IndicatorParameterType.Integer,
            defaultValue: 28, min: 1, max: 500, step: 1,
        },
        {
            id: 'rsiLength', name: 'RSI Length', type: IndicatorParameterType.Integer,
            defaultValue: 14, min: 1, max: 500, step: 1,
        },
        {
            id: 'fastLength', name: 'Fast EMA Length', type: IndicatorParameterType.Integer,
            defaultValue: 12, min: 1, max: 500, step: 1,
        },
        {
            id: 'slowLength', name: 'Slow EMA Length', type: IndicatorParameterType.Integer,
            defaultValue: 26, min: 1, max: 500, step: 1,
        },
        {
            id: 'smaLength', name: 'SMA Length', type: IndicatorParameterType.Integer,
            defaultValue: 9, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [
        {
            id: 'composite', name: 'Composite',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2),
        },
        {
            id: 'sma', name: 'SMA',
            defaultStyle: style(IndicatorSeriesStyle.Line, '#ffca28'),
        },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Percent,
    processorFactory: (parameters) => new CompositeMomentumProcessor(
        integer(parameters?.shortRocLength, 14, 1, 500, 'shortRocLength'),
        integer(parameters?.longRocLength, 28, 1, 500, 'longRocLength'),
        integer(parameters?.rsiLength, 14, 1, 500, 'rsiLength'),
        integer(parameters?.fastLength, 12, 1, 500, 'fastLength'),
        integer(parameters?.slowLength, 26, 1, 500, 'slowLength'),
        integer(parameters?.smaLength, 9, 1, 500, 'smaLength'),
    ),
});

export const ElderImpulseIndicator: IndicatorDefinition<
    IndicatorCandle,
    ElderImpulseParameters
> = registerIndicator({
    id: 'ElderImpulseSystem',
    name: 'Elder Impulse System',
    description: 'Discrete impulse state from the joint direction of EMA and MACD.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: [
        {
            id: 'emaLength', name: 'EMA Length', type: IndicatorParameterType.Integer,
            defaultValue: 13, min: 1, max: 500, step: 1,
        },
        {
            id: 'fastLength', name: 'Fast Length', type: IndicatorParameterType.Integer,
            defaultValue: 12, min: 1, max: 500, step: 1,
        },
        {
            id: 'slowLength', name: 'Slow Length', type: IndicatorParameterType.Integer,
            defaultValue: 26, min: 1, max: 500, step: 1,
        },
    ],
    outputs: [{
        id: 'impulse', name: 'Impulse',
        defaultStyle: style(IndicatorSeriesStyle.Line, '#42a5f5', 2),
    }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.MinusOnePlusOne,
    processorFactory: (parameters) => new ElderImpulseProcessor(
        integer(parameters?.emaLength, 13, 1, 500, 'emaLength'),
        integer(parameters?.fastLength, 12, 1, 500, 'fastLength'),
        integer(parameters?.slowLength, 26, 1, 500, 'slowLength'),
    ),
});

export const CompoundIndicators = Object.freeze([
    PivotPointsIndicator,
    RelativeVigorIndexIndicator,
    BollingerBandsIndicator,
    PriceChannelsIndicator,
    TrueStrengthIndexIndicator,
    KeltnerChannelsIndicator,
    KasePeakOscillatorIndicator,
    KnowSureThingIndicator,
    KlingerVolumeOscillatorIndicator,
    MovingAverageCrossoverIndicator,
    MovingAverageRibbonIndicator,
    RainbowChartsIndicator,
    McClellanOscillatorIndicator,
    EnvelopeIndicator,
    AwesomeOscillatorIndicator,
    ElliotWaveOscillatorIndicator,
    GuppyMultipleMovingAverageIndicator,
    AccelerationIndicator,
    TrixIndicator,
    DoubleExponentialMovingAverageIndicator,
    TripleExponentialMovingAverageIndicator,
    T3MovingAverageIndicator,
    HullMovingAverageIndicator,
    MacdIndicator,
    MacdSignalIndicator,
    PercentagePriceOscillatorIndicator,
    SchaffTrendCycleIndicator,
    StochasticIndicator,
    FastStochasticIndicator,
    BollingerPercentBIndicator,
    ConstanceBrownCompositeIndexIndicator,
    CompositeMomentumIndicator,
    ElderImpulseIndicator,
    WaveTrendOscillatorIndicator,
    WoodiesCciIndicator,
    DonchianChannelsIndicator,
    DetrendedSyntheticPriceIndicator,
] as const);
