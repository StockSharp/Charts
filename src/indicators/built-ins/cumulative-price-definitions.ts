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

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function typicalPrice(value: Readonly<IndicatorCandle>): number | null {
    const high = finite(value?.high);
    const low = finite(value?.low);
    const close = finite(value?.close);
    return high === null || low === null || close === null
        ? null
        : (high + low + close) / 3;
}

const PRICE_LINE_STYLE = Object.freeze({
    series: IndicatorSeriesStyle.Line,
    color: '#26a69a',
    lineWidth: 2,
    options: Object.freeze({ priceLineVisible: false }),
});

export interface TimeWeightedAveragePriceCheckpoint {
    readonly sum: number;
    readonly count: number;
}

export interface ShiftParameters extends IndicatorParameters {
    readonly length: number;
}

export class PassThroughIndicatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    null
> {
    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        _commit: boolean,
    ): IndicatorCalculationResult {
        const value = finite(input.value?.close);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { /* stateless */ }
    protected captureState(): null { return null; }
    protected restoreState(state: null): void {
        if (state !== null)
            throw new TypeError('sschart: invalid Pass Through Indicator checkpoint');
    }
}

/** StockSharp Shift is a warm-up gate; it does not relocate output points. */
export class ShiftProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor(readonly length: number) {
        super(['line']);
        if (!Number.isInteger(length) || length < 1 || length > 500) {
            throw new RangeError(
                'sschart: Shift length must be an integer from 1 to 500',
            );
        }
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        _commit: boolean,
    ): IndicatorCalculationResult {
        const value = input.index < this.length ? null : finite(input.value?.close);
        return {
            isFormed: input.index >= this.length,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { /* position is owned by the sequential base */ }
    protected captureState(): null { return null; }
    protected restoreState(state: null): void {
        if (state !== null) throw new TypeError('sschart: invalid Shift checkpoint');
    }
}

export class MedianPriceProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        _commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const value = high === null || low === null ? null : (high + low) / 2;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { /* stateless */ }
    protected captureState(): null { return null; }
    protected restoreState(state: null): void {
        if (state !== null)
            throw new TypeError('sschart: invalid Median Price checkpoint');
    }
}

export class TypicalPriceProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        _commit: boolean,
    ): IndicatorCalculationResult {
        const value = typicalPrice(input.value);
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { /* stateless */ }
    protected captureState(): null { return null; }
    protected restoreState(state: null): void {
        if (state !== null)
            throw new TypeError('sschart: invalid Typical Price checkpoint');
    }
}

export class WeightedClosePriceProcessor extends SequentialIndicatorProcessor<
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
        const close = finite(input.value?.close);
        const value = high === null || low === null || close === null
            ? null
            : (high + low + 2 * close) / 4;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { /* stateless */ }
    protected captureState(): null { return null; }
    protected restoreState(state: null): void {
        if (state !== null)
            throw new TypeError('sschart: invalid Weighted Close Price checkpoint');
    }
}

export class TimeWeightedAveragePriceProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    TimeWeightedAveragePriceCheckpoint
> {
    private sum = 0;
    private count = 0;

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const typical = typicalPrice(input.value);
        if (typical === null) {
            return {
                isFormed: false,
                values: [this.output('line', null, input.index)],
            };
        }
        const sum = this.sum + typical;
        const count = this.count + 1;
        if (commit) {
            this.sum = sum;
            this.count = count;
        }
        return {
            isFormed: true,
            values: [this.output('line', sum / count, input.index)],
        };
    }

    protected resetState(): void {
        this.sum = 0;
        this.count = 0;
    }

    protected captureState(): TimeWeightedAveragePriceCheckpoint {
        return Object.freeze({ sum: this.sum, count: this.count });
    }

    protected restoreState(state: TimeWeightedAveragePriceCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.sum) === null
            || !Number.isInteger(state.count) || state.count < 0
            || (state.count === 0 && state.sum !== 0)) {
            throw new TypeError('sschart: invalid TWAP checkpoint');
        }
        this.sum = state.sum;
        this.count = state.count;
    }
}

export interface VolumeWeightedAveragePriceCheckpoint {
    readonly priceVolume: number;
    readonly volume: number;
}

export class VolumeWeightedAveragePriceProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    VolumeWeightedAveragePriceCheckpoint
> {
    private priceVolume = 0;
    private volume = 0;

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const typical = typicalPrice(input.value);
        const incomingVolume = finite(input.value?.volume);
        let priceVolume = this.priceVolume;
        let volume = this.volume;
        if (typical !== null && incomingVolume !== null) {
            priceVolume += typical * incomingVolume;
            volume += incomingVolume;
        }
        if (commit) {
            this.priceVolume = priceVolume;
            this.volume = volume;
        }
        const value = volume > 0 ? priceVolume / volume : null;
        return {
            isFormed: value !== null,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.priceVolume = 0;
        this.volume = 0;
    }

    protected captureState(): VolumeWeightedAveragePriceCheckpoint {
        return Object.freeze({
            priceVolume: this.priceVolume,
            volume: this.volume,
        });
    }

    protected restoreState(state: VolumeWeightedAveragePriceCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.priceVolume) === null || finite(state.volume) === null) {
            throw new TypeError('sschart: invalid VWAP checkpoint');
        }
        this.priceVolume = state.priceVolume;
        this.volume = state.volume;
    }
}

export interface AccumulationDistributionLineCheckpoint {
    readonly value: number;
}

export interface WilliamsAccumulationDistributionCheckpoint {
    readonly previousClose: number;
    readonly value: number;
}

export interface WilliamsVariableAccumulationDistributionCheckpoint {
    readonly value: number;
}

export class AccumulationDistributionLineProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    AccumulationDistributionLineCheckpoint
> {
    private current = 0;

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume);
        let value = this.current;
        if (high !== null && low !== null && close !== null && volume !== null) {
            const range = high - low;
            if (range !== 0) {
                const contribution = (((close - low) - (high - close)) / range) * volume;
                if (Number.isFinite(contribution) && Number.isFinite(value + contribution))
                    value += contribution;
            }
        }
        if (commit) this.current = value;
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.current = 0; }
    protected captureState(): AccumulationDistributionLineCheckpoint {
        return Object.freeze({ value: this.current });
    }
    protected restoreState(state: AccumulationDistributionLineCheckpoint): void {
        if (state === null || typeof state !== 'object' || finite(state.value) === null)
            throw new TypeError('sschart: invalid ADL checkpoint');
        this.current = state.value;
    }
}

export class WilliamsAccumulationDistributionProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    WilliamsAccumulationDistributionCheckpoint
> {
    private previousClose = 0;
    private current = 0;

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const close = finite(input.value?.close);
        if (close === null) return this.empty(input.index);
        if (this.previousClose === 0) {
            if (commit) this.previousClose = close;
            return this.empty(input.index);
        }

        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        if (high === null || low === null) {
            if (commit) this.previousClose = close;
            return this.empty(input.index);
        }

        const delta = close > this.previousClose
            ? close - Math.min(low, this.previousClose)
            : close < this.previousClose
                ? close - Math.max(high, this.previousClose)
                : 0;
        const value = this.current + delta;
        if (commit) {
            this.current = value;
            this.previousClose = close;
        }
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void {
        this.previousClose = 0;
        this.current = 0;
    }

    protected captureState(): WilliamsAccumulationDistributionCheckpoint {
        return Object.freeze({
            previousClose: this.previousClose,
            value: this.current,
        });
    }

    protected restoreState(state: WilliamsAccumulationDistributionCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || finite(state.previousClose) === null || finite(state.value) === null) {
            throw new TypeError('sschart: invalid Williams A/D checkpoint');
        }
        this.previousClose = state.previousClose;
        this.current = state.value;
    }

    private empty(index: number): IndicatorCalculationResult {
        return {
            isFormed: false,
            values: [this.output('line', null, index)],
        };
    }
}

export class WilliamsVariableAccumulationDistributionProcessor
    extends SequentialIndicatorProcessor<
        IndicatorCandle,
        WilliamsVariableAccumulationDistributionCheckpoint
    > {
    private current = 0;

    constructor() { super(['line']); }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const open = finite(input.value?.open);
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const volume = finite(input.value?.volume);
        let value = this.current;
        if (open !== null && high !== null && low !== null
            && close !== null && volume !== null) {
            const range = high - low;
            if (range !== 0) {
                const contribution = (close - open) / range * volume;
                if (Number.isFinite(contribution) && Number.isFinite(value + contribution))
                    value += contribution;
            }
        }
        if (commit) this.current = value;
        return {
            isFormed: true,
            values: [this.output('line', value, input.index)],
        };
    }

    protected resetState(): void { this.current = 0; }
    protected captureState(): WilliamsVariableAccumulationDistributionCheckpoint {
        return Object.freeze({ value: this.current });
    }
    protected restoreState(state: WilliamsVariableAccumulationDistributionCheckpoint): void {
        if (state === null || typeof state !== 'object' || finite(state.value) === null)
            throw new TypeError('sschart: invalid WVAD checkpoint');
        this.current = state.value;
    }
}

export const MedianPriceIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'MedianPrice',
    name: 'Median Price',
    description: 'Midpoint of each candle high-low range.',
    category: IndicatorCategory.Price,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'Median Price', defaultStyle: PRICE_LINE_STYLE }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: () => new MedianPriceProcessor(),
});

export const TypicalPriceIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'TypicalPrice',
    name: 'Typical Price',
    description: 'Per-candle average of high, low and close prices.',
    category: IndicatorCategory.Price,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'Typical Price', defaultStyle: PRICE_LINE_STYLE }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: () => new TypicalPriceProcessor(),
});

export const WeightedClosePriceIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'WeightedClosePrice',
    name: 'Weighted Close Price',
    description: 'Per-candle average of high, low and a double-weighted close.',
    category: IndicatorCategory.Price,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'Weighted Close', defaultStyle: PRICE_LINE_STYLE }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: () => new WeightedClosePriceProcessor(),
});

export const PassThroughIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'PassThroughIndicator',
    name: 'Pass Through Indicator',
    description: 'Returns the candle close unchanged for each input bar.',
    category: IndicatorCategory.Price,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'Close', defaultStyle: PRICE_LINE_STYLE }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: () => new PassThroughIndicatorProcessor(),
});

export const ShiftIndicator: IndicatorDefinition<IndicatorCandle, ShiftParameters>
    = registerIndicator({
        id: 'Shift',
        name: 'Shift',
        description: 'Passes through the current close after a fixed warm-up count.',
        category: IndicatorCategory.Price,
        input: CandlestickIndicatorInput,
        parameters: [{
            id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
            defaultValue: 1, min: 1, max: 500, step: 1,
        }],
        outputs: [{ id: 'line', name: 'Shift', defaultStyle: PRICE_LINE_STYLE }],
        naturalPane: IndicatorPane.Overlay,
        measure: IndicatorMeasure.Price,
        processorFactory: (parameters) => new ShiftProcessor(
            parameters?.length === undefined ? 1 : parameters.length,
        ),
    });

export const TimeWeightedAveragePriceIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'TimeWeightedAveragePrice',
    name: 'Time Weighted Average Price',
    description: 'Cumulative average of typical prices from the start of the input session.',
    category: IndicatorCategory.Price,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'TWAP', defaultStyle: PRICE_LINE_STYLE }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: () => new TimeWeightedAveragePriceProcessor(),
});

export const VolumeWeightedAveragePriceIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'VolumeWeightedAveragePrice',
    name: 'Volume Weighted Average Price',
    description: 'Cumulative typical price weighted by volume from the input session start.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'VWAP', defaultStyle: PRICE_LINE_STYLE }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: () => new VolumeWeightedAveragePriceProcessor(),
});

export const AccumulationDistributionLineIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'AccumulationDistributionLine',
    name: 'Accumulation Distribution Line',
    description: 'Cumulative volume-weighted close location within each candle range.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'ADL', defaultStyle: PRICE_LINE_STYLE }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Volume,
    processorFactory: () => new AccumulationDistributionLineProcessor(),
});

export const WilliamsAccumulationDistributionIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'WilliamsAccumulationDistribution',
    name: 'Williams Accumulation Distribution',
    description: 'Cumulative Williams buying and selling pressure relative to the prior close.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'Williams A/D', defaultStyle: PRICE_LINE_STYLE }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Volume,
    processorFactory: () => new WilliamsAccumulationDistributionProcessor(),
});

export const WilliamsVariableAccumulationDistributionIndicator: IndicatorDefinition<
    IndicatorCandle,
    IndicatorParameters
> = registerIndicator({
    id: 'WilliamsVariableAccumulationDistribution',
    name: 'Williams Variable Accumulation Distribution',
    description: 'Cumulative candle-body pressure normalized by range and weighted by volume.',
    category: IndicatorCategory.Volume,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'line', name: 'WVAD', defaultStyle: PRICE_LINE_STYLE }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Volume,
    processorFactory: () => new WilliamsVariableAccumulationDistributionProcessor(),
});

export const CumulativePriceIndicators = Object.freeze([
    PassThroughIndicator,
    ShiftIndicator,
    MedianPriceIndicator,
    TypicalPriceIndicator,
    WeightedClosePriceIndicator,
    TimeWeightedAveragePriceIndicator,
    VolumeWeightedAveragePriceIndicator,
    AccumulationDistributionLineIndicator,
    WilliamsAccumulationDistributionIndicator,
    WilliamsVariableAccumulationDistributionIndicator,
] as const);
