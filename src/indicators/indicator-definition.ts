import type { CandlestickData, Time } from '../core/chart-api.js';

export interface IndicatorCandle extends CandlestickData {
    readonly volume?: number;
}

export const IndicatorCategory = Object.freeze({
    Trend: 'trend',
    Momentum: 'momentum',
    Volatility: 'volatility',
    Volume: 'volume',
    Price: 'price',
    MarketStrength: 'market-strength',
    SupportResistance: 'support-resistance',
    Cycle: 'cycle',
    Statistical: 'statistical',
} as const);
export type IndicatorCategory = typeof IndicatorCategory[keyof typeof IndicatorCategory];

export const IndicatorInputKind = Object.freeze({
    Candlestick: 'candlestick',
    Scalar: 'scalar',
} as const);
export type IndicatorInputKind = typeof IndicatorInputKind[keyof typeof IndicatorInputKind];

export const IndicatorInputFieldType = Object.freeze({
    Number: 'number',
} as const);
export type IndicatorInputFieldType = typeof IndicatorInputFieldType[keyof typeof IndicatorInputFieldType];

export interface IndicatorInputField {
    readonly id: string;
    readonly type: IndicatorInputFieldType;
    readonly required: boolean;
}

export interface IndicatorInputSchema {
    readonly kind: IndicatorInputKind;
    readonly fields: readonly IndicatorInputField[];
}

export const IndicatorParameterType = Object.freeze({
    Number: 'number',
    Integer: 'integer',
    Boolean: 'boolean',
    String: 'string',
} as const);
export type IndicatorParameterType = typeof IndicatorParameterType[keyof typeof IndicatorParameterType];
export type IndicatorParameterValue = number | boolean | string;
export type IndicatorParameters = Readonly<Record<string, IndicatorParameterValue>>;

export interface IndicatorParameterDefinition {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly type: IndicatorParameterType;
    readonly defaultValue: IndicatorParameterValue;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    readonly options?: readonly string[];
}

export const IndicatorSeriesStyle = Object.freeze({
    Line: 'line',
    Histogram: 'histogram',
    Area: 'area',
    Band: 'band',
    Markers: 'markers',
} as const);
export type IndicatorSeriesStyle = typeof IndicatorSeriesStyle[keyof typeof IndicatorSeriesStyle];

export interface IndicatorOutputStyle {
    readonly series: IndicatorSeriesStyle;
    readonly color?: string;
    readonly lineWidth?: number;
    readonly visible?: boolean;
    readonly options?: Readonly<Record<string, string | number | boolean>>;
}

export interface IndicatorOutputDefinition {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly defaultStyle: IndicatorOutputStyle;
}

export type IndicatorOutputFactory<TParameters extends IndicatorParameters> = (
    parameters: TParameters,
) => readonly IndicatorOutputDefinition[];

export const IndicatorPane = Object.freeze({
    Overlay: 'overlay',
    Separate: 'separate',
} as const);
export type IndicatorPane = typeof IndicatorPane[keyof typeof IndicatorPane];

export const IndicatorMeasure = Object.freeze({
    Price: 'price',
    Percent: 'percent',
    MinusOnePlusOne: 'minus-one-plus-one',
    Volume: 'volume',
    Absolute: 'absolute',
} as const);
export type IndicatorMeasure = typeof IndicatorMeasure[keyof typeof IndicatorMeasure];

/** One source value passed to an incremental processor. */
export interface IndicatorProcessInput<TInput> {
    readonly index: number;
    readonly time: Time;
    readonly value: Readonly<TInput>;
    /** False means preview the current input without mutating committed state. */
    readonly isFinal: boolean;
}

/** Immutable painter fields carried alongside one numeric output value. */
export type IndicatorOutputMetadataValue = string | number | boolean | null;
export type IndicatorOutputMetadata = Readonly<Record<string, IndicatorOutputMetadataValue>>;

/** One named numeric value, placed at an explicit logical input index. */
export interface IndicatorOutputValue {
    readonly outputId: string;
    readonly value: number | null;
    readonly targetIndex: number;
    /** Optional flat fields forwarded to the rendered data point. */
    readonly metadata?: IndicatorOutputMetadata;
}

export interface IndicatorProcessResult {
    readonly sourceIndex: number;
    readonly isFormed: boolean;
    readonly values: readonly IndicatorOutputValue[];
}

/**
 * Stateful incremental processor. A non-final process call must leave the
 * checkpoint byte-for-byte equivalent to the state before that call.
 */
export interface IIndicatorProcessor<TInput> {
    readonly position: number;
    reset(): void;
    process(input: IndicatorProcessInput<TInput>): IndicatorProcessResult;
    checkpoint(): unknown;
    restore(checkpoint: unknown): void;
}

export type IndicatorProcessorFactory<
    TInput,
    TParameters extends IndicatorParameters,
> = (parameters: TParameters) => IIndicatorProcessor<TInput>;

/** Metadata and executable factory for one genuinely incremental indicator. */
export interface IndicatorDefinition<
    TInput = IndicatorCandle,
    TParameters extends IndicatorParameters = IndicatorParameters,
> {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly category: IndicatorCategory;
    readonly input: IndicatorInputSchema;
    readonly parameters: readonly IndicatorParameterDefinition[];
    readonly outputs: readonly IndicatorOutputDefinition[];
    /** Resolves parameter-dependent outputs; `outputs` describes the default parameters. */
    readonly outputFactory?: IndicatorOutputFactory<TParameters>;
    readonly naturalPane: IndicatorPane;
    readonly measure: IndicatorMeasure;
    readonly processorFactory: IndicatorProcessorFactory<TInput, TParameters>;
}

export function resolveIndicatorOutputs<TInput, TParameters extends IndicatorParameters>(
    definition: IndicatorDefinition<TInput, TParameters>,
    parameters: TParameters,
): readonly IndicatorOutputDefinition[] {
    return definition.outputFactory?.(parameters) ?? definition.outputs;
}

export const CandlestickIndicatorInput: IndicatorInputSchema = Object.freeze({
    kind: IndicatorInputKind.Candlestick,
    fields: Object.freeze([
        Object.freeze({ id: 'time', type: IndicatorInputFieldType.Number, required: true }),
        Object.freeze({ id: 'open', type: IndicatorInputFieldType.Number, required: true }),
        Object.freeze({ id: 'high', type: IndicatorInputFieldType.Number, required: true }),
        Object.freeze({ id: 'low', type: IndicatorInputFieldType.Number, required: true }),
        Object.freeze({ id: 'close', type: IndicatorInputFieldType.Number, required: true }),
        Object.freeze({ id: 'volume', type: IndicatorInputFieldType.Number, required: false }),
    ]),
});
