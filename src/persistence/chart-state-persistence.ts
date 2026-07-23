import type { DrawingController, DrawingRestoreResult } from '../drawings/drawing-controller.js';
import {
    CHART_STATE_SCHEMA_VERSION,
    normalizeChartStateV1,
    type ChartStateV1,
    type PersistedChartOptions,
    type PersistedIndicator,
    type PersistedPane,
    type PersistedSeries,
} from './chart-state.js';
import { deserializeChartState, serializeChartState } from './serializer.js';

export type MaybePromise<T> = T | Promise<T>;

export interface ChartStateLayoutSnapshot {
    readonly chartOptions: PersistedChartOptions;
    readonly panes: readonly PersistedPane[];
    readonly series: readonly PersistedSeries[];
}

export interface ChartStateLayoutAdapter {
    capture(): ChartStateLayoutSnapshot;
    restore(state: ChartStateLayoutSnapshot): MaybePromise<void>;
}

export interface ChartStateIndicatorAdapter {
    capture(): readonly PersistedIndicator[];
    /** Releases runtime series before the layout removes or recreates their panes. */
    clear(): MaybePromise<void>;
    restore(indicators: readonly PersistedIndicator[]): MaybePromise<void>;
}

/** Host-owned storage. Implementations may use files, a backend, IndexedDB, etc. */
export interface ChartStateStorage {
    load(key: string): MaybePromise<string | null>;
    save(key: string, value: string): MaybePromise<void>;
    remove(key: string): MaybePromise<void>;
}

export interface ChartStatePersistenceOptions<TContext = void> {
    readonly layout: ChartStateLayoutAdapter;
    readonly indicators: ChartStateIndicatorAdapter;
    readonly drawings: DrawingController;
    readonly storage: ChartStateStorage;
    /** Host selects layout-bound vs per-symbol (or any other) storage scope here. */
    readonly key: (context: TContext) => string;
    readonly pretty?: boolean;
}

export interface ChartStateRestoreResult {
    readonly state: ChartStateV1;
    readonly drawings: DrawingRestoreResult;
}

/** Coordinates validated snapshots without owning a storage technology or scope policy. */
export class ChartStatePersistence<TContext = void> {
    private readonly layout: ChartStateLayoutAdapter;
    private readonly indicators: ChartStateIndicatorAdapter;
    private readonly drawings: DrawingController;
    private readonly storage: ChartStateStorage;
    private readonly resolveKey: (context: TContext) => string;
    private readonly pretty: boolean;

    constructor(options: ChartStatePersistenceOptions<TContext>) {
        if (options === null || typeof options !== 'object')
            throw new TypeError('sschart: chart state persistence options are required');
        adapter(options.layout, 'layout', ['capture', 'restore']);
        adapter(options.indicators, 'indicator', ['capture', 'clear', 'restore']);
        adapter(options.storage, 'storage', ['load', 'save', 'remove']);
        if (options.drawings === null || typeof options.drawings !== 'object'
            || typeof options.drawings.drawings !== 'function'
            || typeof options.drawings.replaceAll !== 'function') {
            throw new TypeError('sschart: chart state drawing controller is required');
        }
        if (typeof options.key !== 'function')
            throw new TypeError('sschart: chart state key policy must be a function');
        if (options.pretty !== undefined && typeof options.pretty !== 'boolean')
            throw new TypeError('sschart: chart state pretty option must be boolean');
        this.layout = options.layout;
        this.indicators = options.indicators;
        this.drawings = options.drawings;
        this.storage = options.storage;
        this.resolveKey = options.key;
        this.pretty = options.pretty === true;
    }

    snapshot(): ChartStateV1 {
        const layout = this.layout.capture();
        if (layout === null || typeof layout !== 'object')
            throw new TypeError('sschart: chart state layout adapter returned an invalid snapshot');
        return normalizeChartStateV1({
            schemaVersion: CHART_STATE_SCHEMA_VERSION,
            chartOptions: layout.chartOptions,
            panes: layout.panes,
            series: layout.series,
            indicators: this.indicators.capture(),
            drawings: this.drawings.drawings(),
        });
    }

    async restore(value: ChartStateV1): Promise<ChartStateRestoreResult> {
        const state = normalizeChartStateV1(value);
        await this.indicators.clear();
        await this.layout.restore(Object.freeze({
            chartOptions: state.chartOptions,
            panes: state.panes,
            series: state.series,
        }));
        await this.indicators.restore(state.indicators);
        const drawings = this.drawings.replaceAll(state.drawings, { unknownType: 'skip' });
        return Object.freeze({ state, drawings });
    }

    async save(context: TContext): Promise<ChartStateV1> {
        const state = this.snapshot();
        await this.storage.save(this.key(context), serializeChartState(state, { pretty: this.pretty }));
        return state;
    }

    async load(context: TContext): Promise<ChartStateRestoreResult | null> {
        const serialized = await this.storage.load(this.key(context));
        if (serialized === null) return null;
        if (typeof serialized !== 'string')
            throw new TypeError('sschart: chart state storage load() must return a string or null');
        return this.restore(deserializeChartState(serialized));
    }

    async remove(context: TContext): Promise<void> {
        await this.storage.remove(this.key(context));
    }

    private key(context: TContext): string {
        const key = this.resolveKey(context);
        if (typeof key !== 'string' || key.trim().length === 0)
            throw new TypeError('sschart: chart state key policy must return a non-empty string');
        return key.trim();
    }
}

function adapter(
    value: unknown,
    name: string,
    methods: readonly string[],
): asserts value is Record<string, (...args: any[]) => unknown> {
    if (value === null || typeof value !== 'object'
        || methods.some(method => typeof (value as Record<string, unknown>)[method] !== 'function')) {
        throw new TypeError(`sschart: chart state ${name} adapter is invalid`);
    }
}
