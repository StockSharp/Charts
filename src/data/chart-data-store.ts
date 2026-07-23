import type { DataChangeSet } from '../core/model/data-change-set.js';
import { SeriesStore } from '../core/model/series-store.js';
import type { TimedSeriesData } from '../core/chart-api.js';
import { normalizeBars } from './bar-normalization.js';
import { LodCache, type LodCacheSnapshot } from './lod-cache.js';

export interface ChartDataViewContext {
    readonly symbol: string;
    readonly resolution: string;
    readonly groupingLevel: number;
}

export type ChartDataViewBuilder<TBar extends TimedSeriesData> = (
    rawBars: readonly TBar[],
    context: ChartDataViewContext,
) => readonly TBar[];

export type ChartDataViewUpdater<TBar extends TimedSeriesData> = (
    rawBars: readonly TBar[],
    context: ChartDataViewContext,
    change: DataChangeSet,
) => TBar | null;

export interface ChartDataViewUpdate<TBar extends TimedSeriesData> {
    readonly change: DataChangeSet;
    /** Null asks the controller to rebuild the complete derived view. */
    readonly viewBar: TBar | null;
}

export interface ChartDataStoreOptions<TBar extends TimedSeriesData> {
    readonly viewBuilder?: ChartDataViewBuilder<TBar>;
    readonly viewUpdater?: ChartDataViewUpdater<TBar>;
    readonly lodCacheSize?: number;
}

/** Raw history owner with a separately cached render view. */
export class ChartDataStore<TBar extends TimedSeriesData> {
    private readonly rawStore = new SeriesStore<TBar>();
    private readonly lodCache: LodCache<readonly TBar[]>;
    private readonly viewBuilder?: ChartDataViewBuilder<TBar>;
    private readonly viewUpdater?: ChartDataViewUpdater<TBar>;

    constructor(options: ChartDataStoreOptions<TBar> = {}) {
        if (options === null || typeof options !== 'object')
            throw new TypeError('sschart: chart data store options must be an object');
        if (options.viewBuilder !== undefined && typeof options.viewBuilder !== 'function')
            throw new TypeError('sschart: chart data viewBuilder must be a function');
        if (options.viewUpdater !== undefined && typeof options.viewUpdater !== 'function')
            throw new TypeError('sschart: chart data viewUpdater must be a function');
        if (options.viewUpdater !== undefined && options.viewBuilder === undefined)
            throw new Error('sschart: chart data viewUpdater requires a viewBuilder');
        this.viewBuilder = options.viewBuilder;
        this.viewUpdater = options.viewUpdater;
        this.lodCache = new LodCache(options.lodCacheSize ?? 8);
    }

    get version(): number { return this.rawStore.version; }
    get length(): number { return this.rawStore.length; }
    get first(): TBar | undefined { return this.rawStore.first; }
    get last(): TBar | undefined { return this.rawStore.last; }
    get hasViewBuilder(): boolean { return this.viewBuilder !== undefined; }

    replace(bars: readonly TBar[]): DataChangeSet {
        const change = this.rawStore.replace(normalizeBars(bars));
        this.lodCache.invalidateExceptVersion(this.rawStore.version);
        return change;
    }

    prepend(bars: readonly TBar[]): DataChangeSet | null {
        const change = this.rawStore.prepend(normalizeBars(bars));
        if (change !== null) this.lodCache.invalidateExceptVersion(this.rawStore.version);
        return change;
    }

    update(bar: TBar): DataChangeSet | null {
        const normalized = normalizeBars([bar]);
        const change = this.rawStore.update(normalized[0]);
        if (change !== null) this.lodCache.invalidateExceptVersion(this.rawStore.version);
        return change;
    }

    updateView(bar: TBar, context: ChartDataViewContext): ChartDataViewUpdate<TBar> | null {
        const normalizedContext = normalizeContext(context);
        const normalized = normalizeBars([bar]);
        const change = this.rawStore.update(normalized[0]);
        if (change === null) return null;
        this.lodCache.invalidateExceptVersion(this.rawStore.version);

        let viewBar: TBar | null;
        if (this.viewBuilder === undefined) viewBar = normalized[0];
        else if (this.viewUpdater === undefined) viewBar = null;
        else {
            const updated = this.viewUpdater(this.rawStore.values, normalizedContext, change);
            viewBar = updated === null ? null : normalizeBars([updated])[0];
        }
        return Object.freeze({ change, viewBar });
    }

    clear(): void {
        this.rawStore.replace([]);
        this.lodCache.invalidateExceptVersion(this.rawStore.version);
    }

    raw(): readonly TBar[] { return Object.freeze(this.rawStore.snapshot()); }

    view(context: ChartDataViewContext): readonly TBar[] {
        const normalizedContext = normalizeContext(context);
        return this.lodCache.getOrCreate(
            normalizedContext,
            this.rawStore.version,
            () => {
                const raw = this.raw();
                const built = this.viewBuilder === undefined
                    ? raw
                    : this.viewBuilder(raw, normalizedContext);
                return normalizeBars(built);
            },
        );
    }

    lodCacheSnapshot(): LodCacheSnapshot { return this.lodCache.snapshot(); }
}

function normalizeContext(context: ChartDataViewContext): ChartDataViewContext {
    if (context === null || typeof context !== 'object')
        throw new TypeError('sschart: chart data view context is required');
    if (typeof context.symbol !== 'string' || context.symbol.trim().length === 0)
        throw new TypeError('sschart: chart data view symbol must be a non-empty string');
    if (typeof context.resolution !== 'string' || context.resolution.trim().length === 0)
        throw new TypeError('sschart: chart data view resolution must be a non-empty string');
    if (!Number.isInteger(context.groupingLevel) || context.groupingLevel < 1)
        throw new RangeError('sschart: chart data grouping level must be a positive integer');
    return Object.freeze({
        symbol: context.symbol.trim(),
        resolution: context.resolution.trim(),
        groupingLevel: context.groupingLevel,
    });
}
