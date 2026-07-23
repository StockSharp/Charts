export interface TimedSeriesData {
    time: number;
}

export interface SeriesPriceRange {
    min: number;
    max: number;
}

export interface SeriesRendererPane {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
}

export interface SeriesRendererTheme {
    fontFamily: string;
    textColor: string;
    horizontalGridColor: string;
    verticalGridColor: string;
}

export interface SeriesRendererContext<
    TData extends TimedSeriesData = TimedSeriesData,
    TOptions extends object = object,
> {
    readonly target: CanvasRenderingContext2D;
    readonly data: readonly TData[];
    readonly allData: readonly TData[];
    readonly options: Readonly<TOptions>;
    readonly priceRange: SeriesPriceRange;
    readonly visibleTimeRange: Readonly<{ from: number; to: number }>;
    readonly pane: SeriesRendererPane;
    readonly theme: SeriesRendererTheme;
    readonly barSpacing: number;
    readonly metadata: Readonly<Record<string, unknown>>;
    timeToCoordinate(time: number): number;
    priceToCoordinate(price: number): number;
}

export interface PreparedSeriesData<TData extends TimedSeriesData = TimedSeriesData> {
    readonly data: readonly TData[];
    readonly metadata?: Readonly<Record<string, unknown>>;
}

export type SeriesDataProcessor<TData extends TimedSeriesData, TOptions extends object> = (
    data: readonly TData[],
    options: Readonly<TOptions>,
) => PreparedSeriesData<TData>;

export type SeriesDataUpdateKind = 'append' | 'update';

/** A tail splice emitted by a stateful series data processor. */
export interface SeriesDataProcessorPatch<TData extends TimedSeriesData = TimedSeriesData> {
    readonly fromIndex: number;
    readonly removed: number;
    readonly data: readonly TData[];
    readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Per-series processor instance for transforms whose live update is cheaper
 * than rebuilding their complete output (for example Renko and Point & Figure).
 */
export interface IIncrementalSeriesDataProcessor<
    TData extends TimedSeriesData,
    TOptions extends object,
> {
    reset(data: readonly TData[], options: Readonly<TOptions>): PreparedSeriesData<TData>;
    update(
        point: TData,
        options: Readonly<TOptions>,
        kind: SeriesDataUpdateKind,
    ): SeriesDataProcessorPatch<TData> | null;
}

export type IncrementalSeriesDataProcessorFactory<
    TData extends TimedSeriesData,
    TOptions extends object,
> = () => IIncrementalSeriesDataProcessor<TData, TOptions>;

export interface ISeriesRenderer<
    TData extends TimedSeriesData = TimedSeriesData,
    TOptions extends object = object,
> {
    readonly dataPadding?: number;
    /** Allows all-data overlays to render when no source point intersects the viewport. */
    readonly drawOutsideVisibleRange?: boolean;
    draw(context: SeriesRendererContext<TData, TOptions>): void;
    priceRange?(data: readonly TData[], options: Readonly<TOptions>): SeriesPriceRange | null;
    priceValue?(data: TData, options: Readonly<TOptions>): number | null;
    colorAt?(data: TData, options: Readonly<TOptions>): string | null;
    magnetValues?(data: TData, options: Readonly<TOptions>): readonly number[];
}

declare const seriesDataType: unique symbol;
declare const seriesOptionsType: unique symbol;

export interface SeriesDefinition<
    TData extends TimedSeriesData = TimedSeriesData,
    TOptions extends object = object,
> {
    readonly type: string;
    /** Type-only fields used to preserve data/options inference for registry references. */
    readonly [seriesDataType]?: TData;
    readonly [seriesOptionsType]?: TOptions;
}

export interface CustomSeriesDefinition<
    TData extends TimedSeriesData = TimedSeriesData,
    TOptions extends object = object,
> extends SeriesDefinition<TData, TOptions> {
    readonly defaultOptions: Readonly<TOptions>;
    readonly renderer: ISeriesRenderer<TData, TOptions>;
    readonly dataProcessor?: SeriesDataProcessor<TData, TOptions>;
    readonly incrementalDataProcessorFactory?: IncrementalSeriesDataProcessorFactory<TData, TOptions>;
    readonly affectsTimeScale?: boolean;
}

export class SeriesRendererRegistry {
    private readonly definitions = new Map<string, CustomSeriesDefinition<any, any>>();

    register<TData extends TimedSeriesData, TOptions extends object>(
        definition: CustomSeriesDefinition<TData, TOptions>,
    ): CustomSeriesDefinition<TData, TOptions> {
        if (definition === null || typeof definition !== 'object')
            throw new TypeError('sschart: custom series definition must be an object');
        if (typeof definition.type !== 'string')
            throw new TypeError('sschart: custom series type must be a string');
        const type = definition.type.trim();
        if (type.length === 0) throw new Error('sschart: custom series type cannot be empty');
        if (type !== definition.type)
            throw new Error('sschart: custom series type cannot contain leading or trailing whitespace');
        if (definition.renderer === null || typeof definition.renderer !== 'object'
            || typeof definition.renderer.draw !== 'function')
            throw new TypeError(`sschart: series type '${type}' must provide a renderer.draw function`);
        if (definition.renderer.drawOutsideVisibleRange !== undefined
            && typeof definition.renderer.drawOutsideVisibleRange !== 'boolean') {
            throw new TypeError(
                `sschart: series type '${type}' drawOutsideVisibleRange must be boolean`,
            );
        }
        if (definition.defaultOptions === null || typeof definition.defaultOptions !== 'object')
            throw new TypeError(`sschart: series type '${type}' must provide defaultOptions`);
        if (definition.dataProcessor !== undefined
            && definition.incrementalDataProcessorFactory !== undefined) {
            throw new Error(
                `sschart: series type '${type}' cannot provide both data processor contracts`,
            );
        }
        if (definition.incrementalDataProcessorFactory !== undefined
            && typeof definition.incrementalDataProcessorFactory !== 'function') {
            throw new TypeError(
                `sschart: series type '${type}' incrementalDataProcessorFactory must be a function`,
            );
        }
        const existing = this.definitions.get(type);
        if (existing !== undefined && existing !== definition)
            throw new Error(`sschart: series type '${type}' is already registered`);
        Object.freeze(definition.defaultOptions);
        Object.freeze(definition);
        this.definitions.set(type, definition);
        return definition;
    }

    unregister(type: string): boolean { return this.definitions.delete(type); }
    has(type: string): boolean { return this.definitions.has(type); }
    get(type: string): CustomSeriesDefinition<any, any> | undefined { return this.definitions.get(type); }

    resolve(definition: SeriesDefinition<any, any>): CustomSeriesDefinition<any, any> {
        const inline = definition as Partial<CustomSeriesDefinition<any, any>>;
        if (inline.renderer !== undefined) return this.register(inline as CustomSeriesDefinition<any, any>);
        const registered = this.get(definition.type);
        if (registered === undefined) throw new Error(`sschart: unknown series type '${definition.type}'`);
        return registered;
    }

    reference<TData extends TimedSeriesData = TimedSeriesData, TOptions extends object = object>(
        type: string,
    ): SeriesDefinition<TData, TOptions> {
        if (!this.has(type)) throw new Error(`sschart: unknown series type '${type}'`);
        return Object.freeze({ type });
    }

    types(): readonly string[] { return Array.from(this.definitions.keys()); }
}

export const seriesRendererRegistry = new SeriesRendererRegistry();

export function registerSeries<TData extends TimedSeriesData, TOptions extends object>(
    definition: CustomSeriesDefinition<TData, TOptions>,
): CustomSeriesDefinition<TData, TOptions> {
    return seriesRendererRegistry.register(definition);
}

export function unregisterSeries(type: string): boolean {
    return seriesRendererRegistry.unregister(type);
}

export function getSeriesDefinition(type: string): CustomSeriesDefinition<any, any> | undefined {
    return seriesRendererRegistry.get(type);
}

export function getSeriesTypes(): readonly string[] {
    return seriesRendererRegistry.types();
}
