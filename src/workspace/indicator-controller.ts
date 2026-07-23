import type { ICommandStack } from '../core/interaction/command-stack.js';
import {
    DefaultIndicatorSource,
    IndicatorSourceStatusReason,
    indicatorSourcesEqual,
    normalizeIndicatorOutputStylePatch,
    normalizeIndicatorSource,
    resolveIndicatorOutputs,
    type IndicatorDefinition,
    type IndicatorInputSchema,
    type IndicatorOutputAppearance,
    type IndicatorOutputStylePatch,
    type IndicatorParameterDefinition,
    type IndicatorParameters,
    type IndicatorParameterValue,
    type IndicatorSource,
    type IndicatorSourceStatus,
} from '../indicators/index.js';

export interface IndicatorControllerEngineEntry {
    readonly id: string | number;
    readonly persistenceId: string;
    readonly type: string;
    readonly params: Readonly<Record<string, unknown>>;
    readonly paneId: string | null;
    readonly paneScaleId?: string;
    readonly priceScaleId?: string;
    readonly outputNames?: readonly string[];
    readonly source?: IndicatorSource;
    readonly visible?: boolean;
    readonly definition?: IndicatorDefinition;
}

/** Minimal synchronous engine contract consumed by the public workspace facade. */
export interface IndicatorControllerEngine {
    getIndicators(): readonly IndicatorControllerEngineEntry[];
    replaceParams(
        id: string | number,
        parameters: Readonly<Record<string, unknown>>,
    ): IndicatorControllerEngineEntry | null | undefined;
    setSource(id: string | number, source: IndicatorSource): boolean;
    getSourceStatus(id: string | number): IndicatorSourceStatus | null;
    move(id: string | number, paneId: string): boolean;
    setScale(id: string | number, priceScaleId: string | null): boolean;
    setOutputStyle(
        id: string | number,
        outputId: string,
        patch: IndicatorOutputStylePatch,
    ): boolean;
    setVisible(id: string | number, visible: boolean): boolean;
    getStyles(
        id: string | number,
    ): Readonly<Record<string, Readonly<Record<string, unknown>>>> | null;
    getOutputStyles(
        id: string | number,
    ): Readonly<Record<string, IndicatorOutputAppearance>> | null;
    replaceStyles(id: string | number, styles: Readonly<Record<string, unknown>>): boolean;
    subscribeChange(listener: () => void): void;
    unsubscribeChange(listener: () => void): void;
}

export interface IndicatorControllerOptions {
    readonly engine: IndicatorControllerEngine;
    readonly commandStack: ICommandStack;
}

export interface IndicatorOutputSnapshot {
    readonly id: string;
    readonly name: string;
    readonly style: IndicatorOutputAppearance;
}

export interface IndicatorControllerSnapshot {
    /** Stable layout id. Runtime ids are intentionally not exposed. */
    readonly id: string;
    readonly type: string;
    readonly name: string;
    readonly description: string;
    readonly input: IndicatorInputSchema | null;
    readonly parameterDefinitions: readonly IndicatorParameterDefinition[];
    readonly parameters: IndicatorParameters;
    readonly source: IndicatorSource;
    readonly sourceStatus: IndicatorSourceStatus;
    readonly paneId: string | null;
    /** Explicit selection; null means automatic routing. */
    readonly priceScaleId: string | null;
    readonly effectivePriceScaleId: string;
    readonly visible: boolean;
    readonly outputs: readonly IndicatorOutputSnapshot[];
}

export interface IndicatorUpdatePatch {
    /** Partial parameter patch; omitted values retain their current value. */
    readonly parameters?: Readonly<Record<string, IndicatorParameterValue>>;
    readonly source?: IndicatorSource;
    /** Null moves to the main pane. The target pane must already exist. */
    readonly paneId?: string | null;
    /** Null returns to automatic scale routing. */
    readonly priceScaleId?: string | null;
    readonly visible?: boolean;
    readonly outputs?: Readonly<Record<string, IndicatorOutputStylePatch>>;
}

export type IndicatorControllerListener = (
    indicators: readonly IndicatorControllerSnapshot[],
) => void;

interface IndicatorControllerState {
    readonly parameters: IndicatorParameters;
    readonly source: IndicatorSource;
    readonly paneId: string | null;
    readonly priceScaleId: string | null;
    readonly visible: boolean;
    readonly styles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

interface NormalizedIndicatorUpdate {
    readonly parameters?: IndicatorParameters;
    readonly source?: IndicatorSource;
    readonly paneId?: string | null;
    readonly priceScaleId?: string | null;
    readonly visible?: boolean;
    readonly outputs?: Readonly<Record<string, IndicatorOutputStylePatch>>;
}

/** Undoable, validated editing facade over transient indicator-engine records. */
export class IndicatorController {
    private readonly engine: IndicatorControllerEngine;
    private readonly commands: ICommandStack;
    private readonly listeners = new Set<IndicatorControllerListener>();
    private applying = 0;
    private disposed = false;

    private readonly handleEngineChange = (): void => {
        if (this.disposed || this.applying > 0) return;
        this.emit();
    };

    constructor(options: IndicatorControllerOptions) {
        if (!plainObject(options) || !validEngine(options.engine))
            throw new TypeError('sschart: indicator controller engine is invalid');
        if (options.commandStack === null || typeof options.commandStack !== 'object'
            || typeof options.commandStack.execute !== 'function') {
            throw new TypeError('sschart: indicator controller command stack is invalid');
        }
        this.engine = options.engine;
        this.commands = options.commandStack;
        this.engine.subscribeChange(this.handleEngineChange);
    }

    indicators(): readonly IndicatorControllerSnapshot[] {
        this.assertAlive();
        return Object.freeze(this.engine.getIndicators().map(entry => this.snapshot(entry)));
    }

    get(id: string): IndicatorControllerSnapshot | undefined {
        this.assertAlive();
        const entry = this.findEntry(stableId(id));
        return entry === undefined ? undefined : this.snapshot(entry);
    }

    update(id: string, patch: IndicatorUpdatePatch): IndicatorControllerSnapshot {
        this.assertAlive();
        const stable = stableId(id);
        const entry = this.requireEntry(stable);
        const beforeSnapshot = this.snapshot(entry);
        const before = this.captureState(stable);
        const normalized = normalizeUpdate(patch, beforeSnapshot, entry.definition);
        if (!changesSnapshot(beforeSnapshot, normalized)) return beforeSnapshot;

        let after: IndicatorControllerState | null = null;
        this.commands.execute({
            label: `Update ${beforeSnapshot.name}`,
            execute: () => {
                if (after === null) {
                    this.mutateAtomically(stable, () => this.applyPatch(stable, normalized));
                    after = this.captureState(stable);
                } else {
                    this.applyStateAtomically(stable, after);
                }
            },
            undo: () => this.applyStateAtomically(stable, before),
        });
        return this.snapshot(this.requireEntry(stable));
    }

    setParameters(
        id: string,
        parameters: Readonly<Record<string, IndicatorParameterValue>>,
    ): IndicatorControllerSnapshot {
        return this.update(id, { parameters });
    }

    setSource(id: string, source: IndicatorSource): IndicatorControllerSnapshot {
        return this.update(id, { source });
    }

    moveToPane(id: string, paneId: string | null): IndicatorControllerSnapshot {
        return this.update(id, { paneId });
    }

    setPriceScale(id: string, priceScaleId: string | null): IndicatorControllerSnapshot {
        return this.update(id, { priceScaleId });
    }

    setVisible(id: string, visible: boolean): IndicatorControllerSnapshot {
        return this.update(id, { visible });
    }

    setOutputStyle(
        id: string,
        outputId: string,
        patch: IndicatorOutputStylePatch,
    ): IndicatorControllerSnapshot {
        return this.update(id, { outputs: { [outputIdValue(outputId)]: patch } });
    }

    subscribe(listener: IndicatorControllerListener): void {
        this.assertAlive();
        if (typeof listener !== 'function')
            throw new TypeError('sschart: indicator controller listener must be a function');
        this.listeners.add(listener);
    }

    unsubscribe(listener: IndicatorControllerListener): void {
        this.listeners.delete(listener);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.engine.unsubscribeChange(this.handleEngineChange);
        this.listeners.clear();
    }

    private snapshot(entry: IndicatorControllerEngineEntry): IndicatorControllerSnapshot {
        const id = stableId(entry.persistenceId);
        const definition = entry.definition;
        const parameters = normalizeCurrentParameters(entry.params, definition);
        const source = entry.source ?? DefaultIndicatorSource;
        const sourceStatus = this.engine.getSourceStatus(entry.id) ?? Object.freeze({
            source,
            available: false,
            reason: IndicatorSourceStatusReason.Error,
        });
        const appearances = this.engine.getOutputStyles(entry.id);
        if (appearances === null)
            throw new Error(`sschart: indicator '${id}' output styles are unavailable`);
        const definitions = definition === undefined
            ? []
            : resolveIndicatorOutputs(definition, parameters as any);
        const definitionsById = new Map(definitions.map(output => [output.id, output]));
        const outputIds = entry.outputNames?.length
            ? entry.outputNames
            : Object.keys(appearances);
        const outputs = Object.freeze(outputIds.map((outputId) => {
            const normalizedId = outputIdValue(outputId);
            return Object.freeze({
                id: normalizedId,
                name: definitionsById.get(normalizedId)?.name ?? normalizedId,
                style: appearances[normalizedId] ?? Object.freeze({ visible: true }),
            });
        }));
        return Object.freeze({
            id,
            type: stableId(entry.type, 'indicator type'),
            name: definition?.name ?? entry.type,
            description: definition?.description ?? '',
            input: definition?.input ?? null,
            parameterDefinitions: definition?.parameters ?? Object.freeze([]),
            parameters,
            source,
            sourceStatus,
            paneId: entry.paneId,
            priceScaleId: entry.priceScaleId ?? null,
            effectivePriceScaleId: entry.priceScaleId ?? entry.paneScaleId ?? 'right',
            visible: entry.visible !== false,
            outputs,
        });
    }

    private captureState(stable: string): IndicatorControllerState {
        const entry = this.requireEntry(stable);
        const styles = this.engine.getStyles(entry.id);
        if (styles === null) throw new Error(`sschart: indicator '${stable}' styles are unavailable`);
        return Object.freeze({
            parameters: normalizeCurrentParameters(entry.params, entry.definition),
            source: entry.source ?? DefaultIndicatorSource,
            paneId: entry.paneId,
            priceScaleId: entry.priceScaleId ?? null,
            visible: entry.visible !== false,
            styles: cloneStyles(styles),
        });
    }

    private applyPatch(stable: string, patch: NormalizedIndicatorUpdate): void {
        if (patch.parameters !== undefined) this.replaceParameters(stable, patch.parameters);
        if (patch.source !== undefined) {
            const entry = this.requireEntry(stable);
            if (!indicatorSourcesEqual(entry.source ?? DefaultIndicatorSource, patch.source)
                && !this.engine.setSource(entry.id, patch.source)) {
                throw new Error(`sschart: indicator '${stable}' source could not be updated`);
            }
        }
        if (patch.paneId !== undefined) this.move(stable, patch.paneId);
        if (patch.priceScaleId !== undefined) this.setScale(stable, patch.priceScaleId);
        if (patch.outputs !== undefined) {
            for (const [outputId, style] of Object.entries(patch.outputs)) {
                const entry = this.requireEntry(stable);
                if (!this.engine.setOutputStyle(entry.id, outputId, style)) {
                    throw new Error(
                        `sschart: indicator '${stable}' output '${outputId}' is unavailable`,
                    );
                }
            }
        }
        if (patch.visible !== undefined) this.setVisibility(stable, patch.visible);
    }

    private applyStateAtomically(stable: string, state: IndicatorControllerState): void {
        this.mutateAtomically(stable, () => this.applyState(stable, state));
    }

    private applyState(stable: string, state: IndicatorControllerState): void {
        const current = this.captureState(stable);
        if (!sameRecord(current.parameters, state.parameters))
            this.replaceParameters(stable, state.parameters);
        let entry = this.requireEntry(stable);
        if (!indicatorSourcesEqual(entry.source ?? DefaultIndicatorSource, state.source)
            && !this.engine.setSource(entry.id, state.source)) {
            throw new Error(`sschart: indicator '${stable}' source could not be restored`);
        }
        this.move(stable, state.paneId);
        this.setScale(stable, state.priceScaleId);
        entry = this.requireEntry(stable);
        if (!this.engine.replaceStyles(entry.id, state.styles))
            throw new Error(`sschart: indicator '${stable}' styles could not be restored`);
        this.setVisibility(stable, state.visible);
    }

    private mutateAtomically(stable: string, action: () => void): void {
        const rollback = this.captureState(stable);
        this.applying++;
        try {
            action();
        } catch (error) {
            try {
                this.applyState(stable, rollback);
            } catch (rollbackError) {
                const failure = new Error(
                    `sschart: indicator '${stable}' update and rollback both failed`,
                );
                (failure as Error & { updateError?: unknown; rollbackError?: unknown }).updateError = error;
                (failure as Error & { updateError?: unknown; rollbackError?: unknown }).rollbackError
                    = rollbackError;
                throw failure;
            }
            throw error;
        } finally {
            this.applying--;
        }
        this.emit();
    }

    private replaceParameters(stable: string, parameters: IndicatorParameters): void {
        const entry = this.requireEntry(stable);
        if (sameRecord(entry.params, parameters)) return;
        const replacement = this.engine.replaceParams(entry.id, parameters);
        if (replacement === null || replacement === undefined
            || stableId(replacement.persistenceId) !== stable) {
            throw new Error(`sschart: indicator '${stable}' parameters could not be updated`);
        }
    }

    private move(stable: string, paneId: string | null): void {
        const entry = this.requireEntry(stable);
        if (entry.paneId === paneId) return;
        if (!this.engine.move(entry.id, paneId ?? '__main__'))
            throw new Error(`sschart: indicator '${stable}' could not be moved`);
    }

    private setScale(stable: string, priceScaleId: string | null): void {
        const entry = this.requireEntry(stable);
        if ((entry.priceScaleId ?? null) === priceScaleId) return;
        if (!this.engine.setScale(entry.id, priceScaleId))
            throw new Error(`sschart: indicator '${stable}' price scale could not be updated`);
    }

    private setVisibility(stable: string, visible: boolean): void {
        const entry = this.requireEntry(stable);
        if ((entry.visible !== false) === visible) return;
        if (!this.engine.setVisible(entry.id, visible))
            throw new Error(`sschart: indicator '${stable}' visibility could not be updated`);
    }

    private findEntry(stable: string): IndicatorControllerEngineEntry | undefined {
        return this.engine.getIndicators().find(entry => entry.persistenceId === stable);
    }

    private requireEntry(stable: string): IndicatorControllerEngineEntry {
        const entry = this.findEntry(stable);
        if (entry === undefined) throw new Error(`sschart: indicator '${stable}' is unavailable`);
        return entry;
    }

    private emit(): void {
        if (this.disposed) return;
        const indicators = this.indicators();
        for (const listener of this.listeners) {
            try { listener(indicators); } catch { /* listeners are observers */ }
        }
    }

    private assertAlive(): void {
        if (this.disposed) throw new Error('sschart: indicator controller is disposed');
    }
}

function normalizeUpdate(
    value: IndicatorUpdatePatch,
    current: IndicatorControllerSnapshot,
    definition: IndicatorDefinition | undefined,
): NormalizedIndicatorUpdate {
    if (!plainObject(value)) throw new TypeError('sschart: indicator update must be an object');
    const allowed = new Set([
        'parameters', 'source', 'paneId', 'priceScaleId', 'visible', 'outputs',
    ]);
    for (const key of Object.keys(value)) {
        if (!allowed.has(key))
            throw new TypeError(`sschart: indicator update '${key}' is unsupported`);
    }
    const parameters = value.parameters === undefined
        ? undefined
        : normalizeParameterPatch(value.parameters, current.parameters, definition);
    const source = value.source === undefined ? undefined : normalizeIndicatorSource(value.source);
    const paneId = value.paneId === undefined ? undefined : normalizedPaneId(value.paneId);
    const priceScaleId = value.priceScaleId === undefined
        ? undefined
        : optionalId(value.priceScaleId, 'indicator price scale id');
    if (value.visible !== undefined && typeof value.visible !== 'boolean')
        throw new TypeError('sschart: indicator visible must be boolean');
    const outputs = value.outputs === undefined
        ? undefined
        : normalizeOutputPatches(value.outputs, current, definition, parameters ?? current.parameters);
    return Object.freeze({
        ...(parameters === undefined ? {} : { parameters }),
        ...(source === undefined ? {} : { source }),
        ...(paneId === undefined ? {} : { paneId }),
        ...(priceScaleId === undefined ? {} : { priceScaleId }),
        ...(value.visible === undefined ? {} : { visible: value.visible }),
        ...(outputs === undefined ? {} : { outputs }),
    });
}

function normalizeParameterPatch(
    value: Readonly<Record<string, IndicatorParameterValue>>,
    current: IndicatorParameters,
    definition: IndicatorDefinition | undefined,
): IndicatorParameters {
    if (!plainObject(value))
        throw new TypeError('sschart: indicator parameters must be an object');
    const definitions = new Map((definition?.parameters ?? []).map(item => [item.id, item]));
    const allowed = new Set([...Object.keys(current), ...definitions.keys()]);
    const result: Record<string, IndicatorParameterValue> = { ...current };
    for (const [key, raw] of Object.entries(value)) {
        if (!allowed.has(key))
            throw new TypeError(`sschart: indicator parameter '${key}' is unsupported`);
        result[key] = normalizeParameterValue(raw, definitions.get(key), key);
    }
    return Object.freeze(result);
}

function normalizeCurrentParameters(
    value: Readonly<Record<string, unknown>>,
    definition: IndicatorDefinition | undefined,
): IndicatorParameters {
    if (!plainObject(value))
        throw new TypeError('sschart: indicator parameters must be an object');
    const definitions = new Map((definition?.parameters ?? []).map(item => [item.id, item]));
    const result: Record<string, IndicatorParameterValue> = {};
    for (const [key, raw] of Object.entries(value))
        result[key] = normalizeParameterValue(raw, definitions.get(key), key);
    return Object.freeze(result);
}

function normalizeParameterValue(
    value: unknown,
    definition: IndicatorParameterDefinition | undefined,
    key: string,
): IndicatorParameterValue {
    if (definition === undefined) {
        if (typeof value === 'string' || typeof value === 'boolean') return value;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        throw new TypeError(`sschart: indicator parameter '${key}' has an unsupported value`);
    }
    if (definition?.type === 'boolean') {
        if (typeof value !== 'boolean')
            throw new TypeError(`sschart: indicator parameter '${key}' must be boolean`);
        return value;
    }
    if (definition?.type === 'string') {
        if (typeof value !== 'string')
            throw new TypeError(`sschart: indicator parameter '${key}' must be a string`);
        if (definition.options !== undefined && !definition.options.includes(value))
            throw new RangeError(`sschart: indicator parameter '${key}' is not an allowed option`);
        return value;
    }
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new TypeError(`sschart: indicator parameter '${key}' must be finite`);
    if (definition?.type === 'integer' && !Number.isSafeInteger(value))
        throw new TypeError(`sschart: indicator parameter '${key}' must be an integer`);
    if (definition?.min !== undefined && value < definition.min)
        throw new RangeError(`sschart: indicator parameter '${key}' is below its minimum`);
    if (definition?.max !== undefined && value > definition.max)
        throw new RangeError(`sschart: indicator parameter '${key}' exceeds its maximum`);
    return value;
}

function normalizeOutputPatches(
    value: Readonly<Record<string, IndicatorOutputStylePatch>>,
    current: IndicatorControllerSnapshot,
    definition: IndicatorDefinition | undefined,
    parameters: IndicatorParameters,
): Readonly<Record<string, IndicatorOutputStylePatch>> {
    if (!plainObject(value))
        throw new TypeError('sschart: indicator output styles must be an object');
    const available = definition === undefined
        ? new Set(current.outputs.map(output => output.id))
        : new Set(resolveIndicatorOutputs(definition, parameters as any).map(output => output.id));
    const result: Record<string, IndicatorOutputStylePatch> = {};
    for (const [rawId, rawPatch] of Object.entries(value)) {
        const id = outputIdValue(rawId);
        if (!available.has(id))
            throw new Error(`sschart: indicator output '${id}' is unavailable`);
        result[id] = normalizeIndicatorOutputStylePatch(rawPatch);
    }
    return Object.freeze(result);
}

function changesSnapshot(
    current: IndicatorControllerSnapshot,
    patch: NormalizedIndicatorUpdate,
): boolean {
    if (patch.parameters !== undefined && !sameRecord(current.parameters, patch.parameters)) return true;
    if (patch.source !== undefined && !indicatorSourcesEqual(current.source, patch.source)) return true;
    if (patch.paneId !== undefined && current.paneId !== patch.paneId) return true;
    if (patch.priceScaleId !== undefined && current.priceScaleId !== patch.priceScaleId) return true;
    if (patch.visible !== undefined && current.visible !== patch.visible) return true;
    const byId = new Map(current.outputs.map(output => [output.id, output.style]));
    for (const [outputId, style] of Object.entries(patch.outputs ?? {})) {
        const currentStyle = byId.get(outputId);
        if (currentStyle === undefined) return true;
        for (const [key, next] of Object.entries(style)) {
            const currentValue = currentStyle[key as keyof IndicatorOutputAppearance];
            if ((key === 'precision' || key === 'lineWidth' || key === 'lineStyle')
                && next === null && currentValue === undefined) continue;
            if (currentValue !== next) return true;
        }
    }
    return false;
}

function cloneStyles(
    value: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
    const result: Record<string, Readonly<Record<string, unknown>>> = {};
    for (const [key, options] of Object.entries(value))
        result[key] = cloneRecord(options, `indicator style '${key}'`);
    return Object.freeze(result);
}

function cloneRecord(
    value: Readonly<Record<string, unknown>>,
    path: string,
): Readonly<Record<string, unknown>> {
    if (!plainObject(value)) throw new TypeError(`sschart: ${path} must be an object`);
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = cloneValue(item, `${path}.${key}`);
    return Object.freeze(result);
}

function cloneValue(value: unknown, path: string): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError(`sschart: ${path} must be finite`);
        return value;
    }
    if (Array.isArray(value)) return Object.freeze(value.map((item, index) => (
        cloneValue(item, `${path}[${index}]`)
    )));
    if (plainObject(value)) return cloneRecord(value, path);
    if (value === undefined) return undefined;
    throw new TypeError(`sschart: ${path} is not snapshot-safe`);
}

function sameRecord(
    left: Readonly<Record<string, unknown>>,
    right: Readonly<Record<string, unknown>>,
): boolean {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
        && leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key)
            && sameValue(left[key], right[key]));
}

function sameValue(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length
            && left.every((value, index) => sameValue(value, right[index]));
    }
    return plainObject(left) && plainObject(right) && sameRecord(left, right);
}

function normalizedPaneId(value: string | null): string | null {
    const id = optionalId(value, 'indicator pane id');
    if (id === null || id === 'main' || id === '__main__') return null;
    if (id === '__new__') {
        throw new RangeError(
            "sschart: indicator controller requires an existing pane; '__new__' is not stable",
        );
    }
    return id;
}

function optionalId(value: string | null, name: string): string | null {
    if (value === null) return null;
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string or null`);
    return value.trim();
}

function stableId(value: string, name = 'indicator id'): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}

function outputIdValue(value: string): string {
    return stableId(value, 'indicator output id');
}

function plainObject(value: unknown): value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function validEngine(value: unknown): value is IndicatorControllerEngine {
    if (value === null || typeof value !== 'object') return false;
    const engine = value as Partial<Record<keyof IndicatorControllerEngine, unknown>>;
    return [
        'getIndicators', 'replaceParams', 'setSource', 'getSourceStatus', 'move', 'setScale',
        'setOutputStyle', 'setVisible', 'getStyles', 'getOutputStyles', 'replaceStyles',
        'subscribeChange', 'unsubscribeChange',
    ].every(name => typeof engine[name as keyof IndicatorControllerEngine] === 'function');
}
