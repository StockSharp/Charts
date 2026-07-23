import {
    applyIndicatorStyles,
    captureIndicatorStyles,
} from '../chart/indicators/indicator-styles.js';
import { normalizePersistedObject } from './json-value.js';
import type { PersistedIndicator } from './chart-state.js';
import type {
    ChartStateIndicatorAdapter,
    MaybePromise,
} from './chart-state-persistence.js';
import {
    DefaultIndicatorSource,
    IndicatorSourceKind,
    indicatorSourcesEqual,
    normalizeIndicatorSource,
    type IndicatorSource,
} from '../indicators/indicator-source.js';

export interface PersistableIndicatorStyleSeries {
    options?(): object;
    applyOptions?(options: object): void;
}

export interface PersistableIndicatorEntry {
    readonly id: string | number;
    persistenceId?: string;
    readonly type: string;
    readonly paneId: string | null;
    readonly params: object;
    readonly seriesRefs?: readonly PersistableIndicatorStyleSeries[];
    readonly styleSources?: Readonly<Record<string, PersistableIndicatorStyleSeries>>;
    readonly outputNames?: readonly string[];
    readonly legendSources?: Readonly<Record<string, {
        readonly series?: PersistableIndicatorStyleSeries;
        readonly field?: string;
        readonly colorOption?: string;
        readonly lineWidthOption?: string;
        readonly lineStyleOption?: string;
        readonly visibilityOption?: string;
    }>>;
    colors?: string[];
    readonly source?: IndicatorSource;
    readonly visible?: boolean;
    /** Explicit scale selection; undefined means automatic routing. */
    readonly priceScaleId?: string;
}

export interface IndicatorEnginePersistenceApi {
    getIndicators(): readonly PersistableIndicatorEntry[];
    removeAll(): MaybePromise<void>;
    add(
        type: string,
        params: object,
        targetPaneId?: string,
        persistence?: {
            readonly persistenceId?: string;
            readonly source?: IndicatorSource;
            readonly priceScaleId?: string;
        },
    ): MaybePromise<PersistableIndicatorEntry | null>;
    setVisible(id: string | number, visible: boolean): boolean;
}

export interface IndicatorEngineStateAdapterOptions {
    readonly engine: IndicatorEnginePersistenceApi;
    /** Maps a persisted pane to a host pane-controller target when ids differ. */
    readonly resolveTargetPaneId?: (indicator: PersistedIndicator) => string | undefined;
    readonly onUnknownIndicator?: (indicator: PersistedIndicator) => void;
    readonly onUnknownStyle?: (indicator: PersistedIndicator, styleId: string) => void;
}

/** Persists indicator configuration and painter styles without computed output data. */
export class IndicatorEngineStateAdapter implements ChartStateIndicatorAdapter {
    private readonly engine: IndicatorEnginePersistenceApi;
    private readonly resolveTargetPaneId?: IndicatorEngineStateAdapterOptions['resolveTargetPaneId'];
    private readonly onUnknownIndicator?: IndicatorEngineStateAdapterOptions['onUnknownIndicator'];
    private readonly onUnknownStyle?: IndicatorEngineStateAdapterOptions['onUnknownStyle'];

    constructor(options: IndicatorEngineStateAdapterOptions) {
        if (options === null || typeof options !== 'object'
            || options.engine === null || typeof options.engine !== 'object'
            || typeof options.engine.getIndicators !== 'function'
            || typeof options.engine.removeAll !== 'function'
            || typeof options.engine.add !== 'function'
            || typeof options.engine.setVisible !== 'function') {
            throw new TypeError('sschart: indicator engine state adapter engine is invalid');
        }
        for (const [name, callback] of [
            ['resolveTargetPaneId', options.resolveTargetPaneId],
            ['onUnknownIndicator', options.onUnknownIndicator],
            ['onUnknownStyle', options.onUnknownStyle],
        ] as const) {
            if (callback !== undefined && typeof callback !== 'function')
                throw new TypeError(`sschart: indicator engine state adapter ${name} must be a function`);
        }
        this.engine = options.engine;
        this.resolveTargetPaneId = options.resolveTargetPaneId;
        this.onUnknownIndicator = options.onUnknownIndicator;
        this.onUnknownStyle = options.onUnknownStyle;
    }

    capture(): readonly PersistedIndicator[] {
        const seen = new Set<string>();
        return Object.freeze(this.engine.getIndicators().map((entry, index) => {
            const id = identifier(entry.persistenceId ?? `indicator-${entry.id}`, `indicator ${index} id`);
            if (seen.has(id)) throw new Error(`sschart: duplicate indicator persistence id '${id}'`);
            seen.add(id);
            const type = identifier(entry.type, `indicator '${id}' type`);
            const paneId = entry.paneId === null
                ? null : identifier(entry.paneId, `indicator '${id}' paneId`);
            const source = entry.source === undefined
                ? DefaultIndicatorSource
                : normalizeIndicatorSource(entry.source);
            return Object.freeze({
                id,
                type,
                paneId,
                params: normalizePersistedObject(entry.params, `indicator '${id}' params`, {
                    omitUndefined: true,
                }),
                styles: normalizePersistedObject(
                    captureIndicatorStyles(entry),
                    `indicator '${id}' styles`,
                    { omitUndefined: true },
                ),
                ...(indicatorSourcesEqual(source, DefaultIndicatorSource) ? {} : { source }),
                ...(entry.visible === false ? { visible: false } : {}),
                ...(entry.priceScaleId === undefined
                    ? {}
                    : { priceScaleId: identifier(entry.priceScaleId, `indicator '${id}' priceScaleId`) }),
            });
        }));
    }

    clear(): MaybePromise<void> {
        return this.engine.removeAll();
    }

    async restore(indicators: readonly PersistedIndicator[]): Promise<void> {
        if (!Array.isArray(indicators))
            throw new TypeError('sschart: persisted indicators must be an array');
        const normalized = normalizeIndicators(indicators);
        const plan = orderIndicatorsBySource(normalized).map(indicator => Object.freeze({
            indicator,
            targetPaneId: this.targetPaneId(indicator),
        }));
        for (const { indicator, targetPaneId } of plan) {
            const entry = await this.engine.add(
                indicator.type,
                indicator.params,
                targetPaneId,
                {
                    persistenceId: indicator.id,
                    source: indicator.source,
                    priceScaleId: indicator.priceScaleId,
                },
            );
            if (entry === null || entry === undefined) {
                this.onUnknownIndicator?.(indicator);
                continue;
            }
            entry.persistenceId = indicator.id;
            const skipped = applyIndicatorStyles(entry, indicator.styles);
            for (const styleId of skipped) this.onUnknownStyle?.(indicator, styleId);
            if (indicator.visible === false) this.engine.setVisible(entry.id, false);
        }
    }

    private targetPaneId(indicator: PersistedIndicator): string {
        const resolved = this.resolveTargetPaneId?.(indicator)
            ?? (indicator.paneId === null ? '__main__' : indicator.paneId);
        return identifier(resolved, `indicator '${indicator.id}' target pane`);
    }
}

function orderIndicatorsBySource(
    indicators: readonly PersistedIndicator[],
): readonly PersistedIndicator[] {
    const byId = new Map(indicators.map(indicator => [indicator.id, indicator]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const ordered: PersistedIndicator[] = [];
    const visit = (indicator: PersistedIndicator): void => {
        if (visited.has(indicator.id)) return;
        if (visiting.has(indicator.id))
            throw new RangeError('sschart: persisted indicator source graph contains a cycle');
        visiting.add(indicator.id);
        const source = indicator.source;
        if (source?.kind === IndicatorSourceKind.IndicatorOutput) {
            const upstream = byId.get(source.indicatorId);
            if (upstream === undefined) {
                throw new RangeError(
                    `sschart: persisted indicator source '${source.indicatorId}' is unavailable`,
                );
            }
            visit(upstream);
        }
        visiting.delete(indicator.id);
        visited.add(indicator.id);
        ordered.push(indicator);
    };
    for (const indicator of indicators) visit(indicator);
    return Object.freeze(ordered);
}

function identifier(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}

function normalizeIndicators(value: readonly PersistedIndicator[]): readonly PersistedIndicator[] {
    const seen = new Set<string>();
    return Object.freeze(value.map((raw, index) => {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
            throw new TypeError(`sschart: persisted indicator ${index} must be an object`);
        const prototype = Object.getPrototypeOf(raw);
        if (prototype !== Object.prototype && prototype !== null)
            throw new TypeError(`sschart: persisted indicator ${index} must be a plain object`);
        const source = raw as unknown as Readonly<Record<string, unknown>>;
        const allowed = new Set([
            'id', 'type', 'paneId', 'params', 'styles', 'source', 'visible', 'priceScaleId',
        ]);
        for (const key of Object.keys(source)) {
            if (!allowed.has(key))
                throw new TypeError(`sschart: persisted indicator ${index}.${key} is not supported`);
        }
        for (const key of ['id', 'type', 'paneId', 'params', 'styles']) {
            if (!Object.prototype.hasOwnProperty.call(source, key))
                throw new TypeError(`sschart: persisted indicator ${index}.${key} is required`);
        }
        const id = identifier(source.id, `persisted indicator ${index} id`);
        if (seen.has(id)) throw new Error(`sschart: duplicate indicator persistence id '${id}'`);
        seen.add(id);
        const paneId = source.paneId === null
            ? null : identifier(source.paneId, `persisted indicator '${id}' paneId`);
        const styles = normalizePersistedObject(source.styles, `indicator '${id}' styles`);
        for (const [styleId, options] of Object.entries(styles)) {
            if (options === null || typeof options !== 'object' || Array.isArray(options))
                throw new TypeError(`sschart: indicator '${id}' style '${styleId}' must be an object`);
        }
        const sourceBinding = source.source === undefined
            ? undefined
            : normalizeIndicatorSource(source.source);
        if (source.visible !== undefined && typeof source.visible !== 'boolean')
            throw new TypeError(`sschart: persisted indicator '${id}' visible must be boolean`);
        const priceScaleId = source.priceScaleId === undefined
            ? undefined
            : identifier(source.priceScaleId, `persisted indicator '${id}' priceScaleId`);
        return Object.freeze({
            id,
            type: identifier(source.type, `persisted indicator '${id}' type`),
            paneId,
            params: normalizePersistedObject(source.params, `indicator '${id}' params`),
            styles,
            ...(sourceBinding === undefined ? {} : { source: sourceBinding }),
            ...(source.visible === undefined ? {} : { visible: source.visible }),
            ...(priceScaleId === undefined ? {} : { priceScaleId }),
        });
    }));
}
