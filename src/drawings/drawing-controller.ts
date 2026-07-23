import type {
    ChartClick,
    CrosshairEvent,
    IChartApi,
    ICommandStack,
    IPaneApi,
    ISeriesApi,
} from '../core/chart-api.js';
import type { TimedSeriesData } from '../series/registry.js';
import {
    normalizeDrawingInstance,
    normalizeDrawingOptions,
    type DrawingInstance,
    type DrawingOptions,
    type DrawingPoint,
} from './drawing-model.js';
import {
    drawingDefinitionRegistry,
    type DrawingDefinition,
    type DrawingDefinitionRegistry,
    type DrawingPrimitiveBinding,
    type DrawingPrimitiveEvents,
} from './drawing-registry.js';
import {
    DrawingMagnet,
    type DrawingMagnetInput,
    type DrawingMagnetOptions,
    type DrawingMagnetSettings,
} from './drawing-magnet.js';

export interface DrawingInstancePatch {
    readonly paneId?: string;
    readonly points?: readonly DrawingPoint[];
    readonly options?: DrawingOptions;
    readonly visible?: boolean;
    readonly locked?: boolean;
    readonly zOrder?: number;
}

export interface CreateDrawingOptions {
    readonly id?: string;
    readonly paneId?: string;
    readonly options?: DrawingOptions;
    readonly visible?: boolean;
    readonly locked?: boolean;
    readonly zOrder?: number;
}

export interface DrawingControllerOptions {
    readonly chart: IChartApi;
    readonly registry?: DrawingDefinitionRegistry;
    readonly commandStack?: ICommandStack;
    readonly idFactory?: (type: string) => string;
    readonly magnet?: DrawingMagnetOptions;
}

export type DrawingControllerListener = (drawings: readonly DrawingInstance[]) => void;

export interface DrawingCreationSnapshot {
    readonly type: string;
    readonly name: string;
    readonly paneId: string | null;
    readonly points: readonly DrawingPoint[];
    readonly previewPoint: DrawingPoint | null;
    readonly minimumPoints: number;
    readonly maximumPoints: number;
}

export type DrawingCreationListener = (creation: DrawingCreationSnapshot | null) => void;

export interface DrawingRestoreOptions {
    readonly unknownType?: 'skip' | 'error';
}

export interface SkippedDrawing {
    readonly id: string;
    readonly type: string;
    readonly reason: 'unknown-type';
}

export interface DrawingRestoreResult {
    readonly restored: readonly DrawingInstance[];
    readonly skipped: readonly SkippedDrawing[];
}

interface DrawingRecord {
    instance: DrawingInstance;
    readonly binding: DrawingPrimitiveBinding;
    attached: boolean;
    previewOrigin: DrawingInstance | null;
}

interface DrawingDraft {
    instance: DrawingInstance;
    readonly binding: DrawingPrimitiveBinding;
}

interface ActiveDrawingCreation {
    readonly definition: DrawingDefinition;
    readonly options: CreateDrawingOptions;
    paneId: string | null;
    readonly points: DrawingPoint[];
    previewPoint: DrawingPoint | null;
    previewInput: DrawingMagnetInput | null;
    draft: DrawingDraft | null;
}

/** Owns serializable drawings, primitive bindings and one undoable mutation path. */
export class DrawingController {
    private readonly chart: IChartApi;
    private readonly registry: DrawingDefinitionRegistry;
    private readonly commands: ICommandStack;
    private readonly idFactory?: (type: string) => string;
    private readonly magnet: DrawingMagnet;
    private readonly records = new Map<string, DrawingRecord>();
    private readonly listeners = new Set<DrawingControllerListener>();
    private readonly creationListeners = new Set<DrawingCreationListener>();
    private activeCreation: ActiveDrawingCreation | null = null;
    private nextId = 1;
    private nextDraftId = 1;
    private disposed = false;
    private readonly handleChartClick = (event: ChartClick): void => this.acceptCreationPoint(event);
    private readonly handleCrosshairMove = (event: CrosshairEvent): void => this.previewCreationPoint(event);

    constructor(options: DrawingControllerOptions) {
        if (options === null || typeof options !== 'object'
            || options.chart === null || typeof options.chart !== 'object') {
            throw new TypeError('sschart: drawing controller chart is required');
        }
        if (options.idFactory !== undefined && typeof options.idFactory !== 'function')
            throw new TypeError('sschart: drawing controller idFactory must be a function');
        this.chart = options.chart;
        this.registry = options.registry ?? drawingDefinitionRegistry;
        this.commands = options.commandStack ?? options.chart.commandStack();
        this.idFactory = options.idFactory;
        this.magnet = new DrawingMagnet(options.magnet);
    }

    drawings(): readonly DrawingInstance[] {
        return Object.freeze([...this.records.values()]
            .map(record => record.instance)
            .sort((left, right) => left.zOrder - right.zOrder || left.id.localeCompare(right.id)));
    }

    get(id: string): DrawingInstance | undefined { return this.records.get(id)?.instance; }
    has(id: string): boolean { return this.records.has(id); }

    magnetOptions(): DrawingMagnetSettings { return this.magnet.options(); }

    applyMagnetOptions(patch: DrawingMagnetOptions): void {
        this.assertAlive();
        this.magnet.applyOptions(patch);
        const active = this.activeCreation;
        if (active === null || active.previewInput === null) return;
        const preview = this.magnet.resolve(active.previewInput).point;
        if (samePoint(active.previewPoint, preview)) return;
        active.previewPoint = preview;
        this.refreshDraft(active);
        this.emitCreation();
    }

    creation(): DrawingCreationSnapshot | null {
        const active = this.activeCreation;
        if (active === null) return null;
        return Object.freeze({
            type: active.definition.type,
            name: active.definition.name,
            paneId: active.paneId,
            points: Object.freeze([...active.points]),
            previewPoint: active.previewPoint,
            minimumPoints: active.definition.points.min,
            maximumPoints: active.definition.points.max,
        });
    }

    beginCreation(type: string, options: CreateDrawingOptions = {}): void {
        this.assertAlive();
        const definition = this.requireDefinition(type);
        const normalizedOptions = this.normalizeCreateOptions(definition, options);
        if (this.activeCreation !== null) this.cancelCreation();
        const active: ActiveDrawingCreation = {
            definition,
            options: normalizedOptions,
            paneId: normalizedOptions.paneId ?? null,
            points: [],
            previewPoint: null,
            previewInput: null,
            draft: null,
        };
        this.activeCreation = active;
        this.chart.subscribeClick(this.handleChartClick);
        this.chart.subscribeCrosshairMove(this.handleCrosshairMove);
        try {
            this.chart.beginDrawing();
        } catch (error) {
            this.unsubscribeCreationInput();
            this.activeCreation = null;
            throw error;
        }
        this.emitCreation();
    }

    finishCreation(): DrawingInstance | null {
        this.assertAlive();
        const active = this.activeCreation;
        if (active === null || active.points.length < active.definition.points.min) return null;
        const paneId = active.paneId;
        if (paneId === null) return null;
        this.clearDraft(active);
        let drawing: DrawingInstance;
        try {
            drawing = this.create(active.definition.type, active.points, {
                ...active.options,
                paneId,
            });
        } catch (error) {
            this.refreshDraft(active);
            throw error;
        }
        this.endCreation(active);
        return drawing;
    }

    cancelCreation(): boolean {
        this.assertAlive();
        const active = this.activeCreation;
        if (active === null) return false;
        this.endCreation(active);
        return true;
    }

    subscribeCreation(listener: DrawingCreationListener): void {
        this.assertAlive();
        if (typeof listener !== 'function')
            throw new TypeError('sschart: drawing creation listener must be a function');
        this.creationListeners.add(listener);
    }

    unsubscribeCreation(listener: DrawingCreationListener): void {
        this.creationListeners.delete(listener);
    }

    replaceAll(
        instances: readonly DrawingInstance[],
        options: DrawingRestoreOptions = {},
    ): DrawingRestoreResult {
        this.assertAlive();
        if (!Array.isArray(instances))
            throw new TypeError('sschart: restored drawings must be an array');
        if (options === null || typeof options !== 'object')
            throw new TypeError('sschart: drawing restore options must be an object');
        const unknownType = options.unknownType ?? 'skip';
        if (unknownType !== 'skip' && unknownType !== 'error')
            throw new RangeError(`sschart: unknown drawing restore policy '${String(unknownType)}'`);
        if (this.commands.snapshot().transactionActive)
            throw new Error('sschart: cannot restore drawings during a command transaction');

        const restored: DrawingInstance[] = [];
        const skipped: SkippedDrawing[] = [];
        const ids = new Set<string>();
        for (const value of instances) {
            const normalized = normalizeDrawingInstance(value);
            if (ids.has(normalized.id))
                throw new Error(`sschart: duplicate restored drawing id '${normalized.id}'`);
            ids.add(normalized.id);
            const definition = this.registry.get(normalized.type);
            if (definition === undefined) {
                if (unknownType === 'error')
                    throw new Error(`sschart: unknown drawing type '${normalized.type}'`);
                skipped.push(Object.freeze({
                    id: normalized.id,
                    type: normalized.type,
                    reason: 'unknown-type',
                }));
                continue;
            }
            restored.push(this.prepare(normalized, definition));
        }

        if (this.activeCreation !== null) this.cancelCreation();
        const previous = this.drawings();
        this.clearInternal(false);
        try {
            for (const instance of restored) this.insertInternal(instance, false);
        } catch (error) {
            this.clearInternal(false);
            try {
                for (const instance of previous) this.insertInternal(instance, false);
            } catch { /* preserve the original restore failure */ }
            this.emit();
            throw error;
        }
        this.commands.clear();
        this.emit();
        return Object.freeze({
            restored: Object.freeze([...restored]),
            skipped: Object.freeze(skipped),
        });
    }

    create(
        type: string,
        points: readonly DrawingPoint[],
        options: CreateDrawingOptions = {},
    ): DrawingInstance {
        this.assertAlive();
        const definition = this.requireDefinition(type);
        const id = options.id ?? this.generateId(definition.type);
        const instance = this.prepare({
            id,
            type: definition.type,
            paneId: options.paneId ?? 'main',
            points,
            options: {
                ...definition.defaultOptions,
                ...(options.options ?? {}),
            },
            visible: options.visible ?? true,
            locked: options.locked ?? false,
            zOrder: options.zOrder ?? this.nextZOrder(),
        }, definition);
        this.executeInsert(instance, `Create ${definition.name}`);
        return instance;
    }

    add(instance: DrawingInstance): DrawingInstance {
        this.assertAlive();
        const definition = this.requireDefinition(instance.type);
        const normalized = this.prepare(instance, definition);
        this.executeInsert(normalized, `Add ${definition.name}`);
        return normalized;
    }

    update(id: string, patch: DrawingInstancePatch): DrawingInstance {
        this.assertAlive();
        if (patch === null || typeof patch !== 'object')
            throw new TypeError('sschart: drawing patch must be an object');
        const before = this.requireRecord(id).instance;
        const after = this.prepare({
            ...before,
            ...patch,
            id: before.id,
            type: before.type,
            options: patch.options ?? before.options,
            points: patch.points ?? before.points,
        }, this.requireDefinition(before.type));
        this.executeReplace(before, after, 'Update drawing');
        return after;
    }

    updateOptions(id: string, patch: DrawingOptions): DrawingInstance {
        this.assertAlive();
        const before = this.requireRecord(id).instance;
        const options = normalizeDrawingOptions({ ...before.options, ...patch });
        return this.update(id, { options });
    }

    setVisible(id: string, visible: boolean): DrawingInstance {
        return this.update(id, { visible });
    }

    setLocked(id: string, locked: boolean): DrawingInstance {
        return this.update(id, { locked });
    }

    moveToPane(id: string, paneId: string): DrawingInstance {
        return this.update(id, { paneId });
    }

    remove(id: string): boolean {
        this.assertAlive();
        const record = this.records.get(id);
        if (record === undefined) return false;
        const instance = record.instance;
        const definition = this.requireDefinition(instance.type);
        this.commands.execute({
            label: `Remove ${definition.name}`,
            execute: () => this.removeInternal(id),
            undo: () => this.insertInternal(instance),
            redo: () => this.removeInternal(id),
        });
        return true;
    }

    duplicate(id: string, duplicateId?: string): DrawingInstance {
        this.assertAlive();
        const source = this.requireRecord(id).instance;
        const copy = this.prepare({
            ...source,
            id: duplicateId ?? this.generateId(source.type),
            points: source.points.map(point => ({ ...point })),
            options: { ...source.options },
            zOrder: this.nextZOrder(),
        }, this.requireDefinition(source.type));
        this.executeInsert(copy, 'Duplicate drawing');
        return copy;
    }

    clear(): boolean {
        this.assertAlive();
        const previous = this.drawings();
        if (previous.length === 0) return false;
        this.commands.execute({
            label: 'Clear drawings',
            execute: () => this.clearInternal(),
            undo: () => {
                for (const instance of previous) this.insertInternal(instance, false);
                this.emit();
            },
            redo: () => this.clearInternal(),
        });
        return true;
    }

    subscribe(listener: DrawingControllerListener): void {
        this.assertAlive();
        if (typeof listener !== 'function')
            throw new TypeError('sschart: drawing listener must be a function');
        this.listeners.add(listener);
    }

    unsubscribe(listener: DrawingControllerListener): void { this.listeners.delete(listener); }

    dispose(): void {
        if (this.disposed) return;
        const active = this.activeCreation;
        if (active !== null) {
            this.clearDraft(active);
            this.activeCreation = null;
            this.unsubscribeCreationInput();
            try { this.chart.finishDrawing(); } catch { /* chart may already be gone */ }
        }
        this.disposed = true;
        this.clearInternal(false);
        this.listeners.clear();
        this.creationListeners.clear();
    }

    private acceptCreationPoint(event: ChartClick): void {
        const active = this.activeCreation;
        if (active === null || event.button !== 0
            || event.time === null || event.price === null
            || !Number.isFinite(event.time) || !Number.isFinite(event.price)) return;
        if (active.paneId !== null && active.paneId !== event.paneId) return;
        active.paneId ??= event.paneId;
        const input = this.magnetInput(
            event.time,
            event.price,
            event.point,
            event.paneId,
            event.seriesData,
        );
        const point = this.magnet.resolve(input).point;
        active.previewInput = input;
        active.points.push(point);
        active.previewPoint = point;
        this.emitCreation();
        if (active.points.length >= active.definition.points.max) {
            this.finishCreation();
            return;
        }
        this.refreshDraft(active);
    }

    private previewCreationPoint(event: CrosshairEvent): void {
        const active = this.activeCreation;
        if (active === null) return;
        const usable = event.time !== null && event.price !== null && event.paneId !== null
            && event.point !== null
            && Number.isFinite(event.time) && Number.isFinite(event.price)
            && (active.paneId === null || active.paneId === event.paneId);
        const input = usable
            ? this.magnetInput(
                event.time as number,
                event.price as number,
                event.point as { x: number; y: number },
                event.paneId as string,
                event.seriesData,
            )
            : null;
        const preview = input === null ? null : this.magnet.resolve(input).point;
        active.previewInput = input;
        if (samePoint(active.previewPoint, preview)) return;
        active.previewPoint = preview;
        if (preview === null) this.clearDraft(active);
        else this.refreshDraft(active);
        this.emitCreation();
    }

    private magnetInput(
        time: number,
        price: number,
        coordinate: Readonly<{ x: number; y: number }>,
        paneId: string,
        seriesData: ReadonlyMap<ISeriesApi<any, any>, TimedSeriesData>,
    ): DrawingMagnetInput {
        return Object.freeze({
            time,
            price,
            coordinate: Object.freeze({ x: coordinate.x, y: coordinate.y }),
            pane: this.resolvePane(paneId),
            seriesData,
        });
    }

    private refreshDraft(active: ActiveDrawingCreation): void {
        if (active !== this.activeCreation || active.paneId === null
            || active.points.length === 0 || active.previewPoint === null) {
            this.clearDraft(active);
            return;
        }
        const points = [...active.points, active.previewPoint];
        while (points.length < active.definition.points.min) points.push(active.previewPoint);
        if (points.length > active.definition.points.max)
            points.length = active.definition.points.max;
        const current = active.draft;
        const instance = this.prepare({
            id: current?.instance.id ?? `__sschart-draft-${this.nextDraftId++}`,
            type: active.definition.type,
            paneId: active.paneId,
            points,
            options: active.options.options ?? active.definition.defaultOptions,
            visible: true,
            locked: active.options.locked ?? false,
            zOrder: active.options.zOrder ?? this.nextZOrder(),
        }, active.definition);
        if (current !== null) {
            current.binding.update(instance);
            current.instance = instance;
            return;
        }
        const binding = active.definition.create(instance, noOpPrimitiveEvents);
        validateBinding(binding, active.definition.type);
        try {
            this.chart.attachPrimitive(binding.primitive, {
                pane: this.resolvePane(instance.paneId),
                priceScaleId: 'right',
            });
        } catch (error) {
            try { binding.dispose?.(); } catch { /* preserve attach failure */ }
            throw error;
        }
        active.draft = { instance, binding };
    }

    private clearDraft(active: ActiveDrawingCreation): void {
        const draft = active.draft;
        if (draft === null) return;
        active.draft = null;
        try { this.chart.detachPrimitive(draft.binding.primitive); } catch { /* chart may be gone */ }
        try { draft.binding.dispose?.(); } catch { /* disposal is best-effort */ }
    }

    private endCreation(active: ActiveDrawingCreation): void {
        if (active !== this.activeCreation) return;
        this.clearDraft(active);
        this.activeCreation = null;
        this.unsubscribeCreationInput();
        this.chart.finishDrawing();
        this.emitCreation();
    }

    private unsubscribeCreationInput(): void {
        this.chart.unsubscribeClick(this.handleChartClick);
        this.chart.unsubscribeCrosshairMove(this.handleCrosshairMove);
    }

    private normalizeCreateOptions(
        definition: DrawingDefinition,
        options: CreateDrawingOptions,
    ): CreateDrawingOptions {
        if (options === null || typeof options !== 'object')
            throw new TypeError('sschart: drawing create options must be an object');
        let id = options.id;
        if (id !== undefined) {
            if (typeof id !== 'string' || id.trim().length === 0)
                throw new TypeError('sschart: drawing id must be a non-empty string');
            id = id.trim();
            if (this.records.has(id))
                throw new Error(`sschart: drawing id '${id}' is already in use`);
        }
        let paneId = options.paneId;
        if (paneId !== undefined) {
            if (typeof paneId !== 'string' || paneId.trim().length === 0)
                throw new TypeError('sschart: drawing paneId must be a non-empty string');
            paneId = paneId.trim();
            this.resolvePane(paneId);
        }
        if (options.visible !== undefined && typeof options.visible !== 'boolean')
            throw new TypeError('sschart: drawing visible must be boolean');
        if (options.locked !== undefined && typeof options.locked !== 'boolean')
            throw new TypeError('sschart: drawing locked must be boolean');
        if (options.zOrder !== undefined && !Number.isSafeInteger(options.zOrder))
            throw new RangeError('sschart: drawing zOrder must be a safe integer');
        return Object.freeze({
            id,
            paneId,
            options: normalizeDrawingOptions({
                ...definition.defaultOptions,
                ...(options.options ?? {}),
            }),
            visible: options.visible,
            locked: options.locked,
            zOrder: options.zOrder,
        });
    }

    private executeInsert(instance: DrawingInstance, label: string): void {
        if (this.records.has(instance.id))
            throw new Error(`sschart: drawing id '${instance.id}' is already in use`);
        this.commands.execute({
            label,
            execute: () => this.insertInternal(instance),
            undo: () => this.removeInternal(instance.id),
            redo: () => this.insertInternal(instance),
        });
    }

    private executeReplace(
        before: DrawingInstance,
        after: DrawingInstance,
        label: string,
    ): void {
        if (sameInstance(before, after)) return;
        this.commands.execute({
            label,
            execute: () => this.replaceInternal(after),
            undo: () => this.replaceInternal(before),
            redo: () => this.replaceInternal(after),
        });
    }

    private insertInternal(instance: DrawingInstance, notify = true): void {
        if (this.records.has(instance.id))
            throw new Error(`sschart: drawing id '${instance.id}' is already in use`);
        const definition = this.requireDefinition(instance.type);
        const events: DrawingPrimitiveEvents = {
            preview: next => this.previewFromPrimitive(instance.id, next),
            commit: next => this.commitFromPrimitive(instance.id, next),
            cancel: next => this.cancelFromPrimitive(instance.id, next),
        };
        const binding = definition.create(instance, events);
        validateBinding(binding, definition.type);
        const record: DrawingRecord = {
            instance,
            binding,
            attached: false,
            previewOrigin: null,
        };
        this.records.set(instance.id, record);
        try {
            if (instance.visible) this.attach(record);
        } catch (error) {
            this.records.delete(instance.id);
            try { binding.dispose?.(); } catch { /* preserve attach failure */ }
            throw error;
        }
        if (notify) this.emit();
    }

    private replaceInternal(instance: DrawingInstance, notify = true): void {
        const record = this.requireRecord(instance.id);
        const previous = record.instance;
        const wasAttached = record.attached;
        try {
            record.instance = instance;
            record.previewOrigin = null;
            if (record.attached && (!instance.visible || instance.paneId !== previous.paneId))
                this.detach(record);
            record.binding.update(instance);
            if (!record.attached && instance.visible) this.attach(record);
        } catch (error) {
            try { if (record.attached) this.detach(record); } catch { /* restore below */ }
            record.instance = previous;
            record.previewOrigin = null;
            try { record.binding.update(previous); } catch { /* preserve mutation failure */ }
            if (wasAttached) {
                try { this.attach(record); } catch { /* preserve mutation failure */ }
            }
            throw error;
        }
        if (notify) this.emit();
    }

    private removeInternal(id: string, notify = true): void {
        const record = this.requireRecord(id);
        if (record.attached) this.detach(record);
        this.records.delete(id);
        try { record.binding.dispose?.(); } catch { /* disposal is best-effort */ }
        if (notify) this.emit();
    }

    private clearInternal(notify = true): void {
        for (const record of this.records.values()) {
            try { if (record.attached) this.detach(record); } catch { /* chart may be gone */ }
            try { record.binding.dispose?.(); } catch { /* disposal is best-effort */ }
        }
        this.records.clear();
        if (notify) this.emit();
    }

    private previewFromPrimitive(id: string, candidate: DrawingInstance): void {
        const record = this.requireRecord(id);
        const next = this.primitiveCandidate(record.instance, candidate);
        record.previewOrigin ??= record.instance;
        record.instance = next;
        this.emit();
    }

    private commitFromPrimitive(id: string, candidate: DrawingInstance): void {
        const record = this.requireRecord(id);
        const after = this.primitiveCandidate(record.instance, candidate);
        const before = record.previewOrigin ?? record.instance;
        record.previewOrigin = null;
        record.instance = before;
        this.executeReplace(before, after, 'Edit drawing');
    }

    private cancelFromPrimitive(id: string, candidate: DrawingInstance): void {
        const record = this.requireRecord(id);
        const origin = record.previewOrigin;
        record.previewOrigin = null;
        const restored = origin ?? this.primitiveCandidate(record.instance, candidate);
        record.instance = restored;
        record.binding.update(restored);
        this.emit();
    }

    private primitiveCandidate(
        current: DrawingInstance,
        candidate: DrawingInstance,
    ): DrawingInstance {
        if (candidate.id !== current.id || candidate.type !== current.type)
            throw new Error('sschart: drawing primitive cannot change drawing identity');
        return this.prepare(candidate, this.requireDefinition(current.type));
    }

    private attach(record: DrawingRecord): void {
        const pane = this.resolvePane(record.instance.paneId);
        this.chart.attachPrimitive(record.binding.primitive, { pane, priceScaleId: 'right' });
        record.attached = true;
    }

    private detach(record: DrawingRecord): void {
        this.chart.detachPrimitive(record.binding.primitive);
        record.attached = false;
    }

    private resolvePane(id: string): IPaneApi {
        const pane = this.chart.panes().find(candidate => candidate.id() === id);
        if (pane === undefined) throw new Error(`sschart: drawing pane '${id}' is not available`);
        return pane;
    }

    private prepare(
        instance: DrawingInstance,
        definition: DrawingDefinition = this.requireDefinition(instance.type),
    ): DrawingInstance {
        let normalized = normalizeDrawingInstance(instance);
        if (definition.normalizeOptions !== undefined) {
            const options = normalizeDrawingOptions(definition.normalizeOptions(normalized.options));
            normalized = normalizeDrawingInstance({ ...normalized, options });
        }
        const count = normalized.points.length;
        if (count < definition.points.min || count > definition.points.max) {
            throw new RangeError(
                `sschart: drawing type '${definition.type}' requires ${definition.points.min}`
                + (definition.points.min === definition.points.max
                    ? ''
                    : `..${definition.points.max}`)
                + ' point(s)',
            );
        }
        this.resolvePane(normalized.paneId);
        return normalized;
    }

    private requireDefinition(type: string): DrawingDefinition {
        const definition = this.registry.get(type);
        if (definition === undefined)
            throw new Error(`sschart: unknown drawing type '${type}'`);
        return definition;
    }

    private requireRecord(id: string): DrawingRecord {
        const record = this.records.get(id);
        if (record === undefined) throw new Error(`sschart: drawing '${id}' does not exist`);
        return record;
    }

    private generateId(type: string): string {
        for (;;) {
            const candidate = this.idFactory?.(type) ?? `${type}-${this.nextId++}`;
            if (typeof candidate !== 'string' || candidate.trim().length === 0)
                throw new TypeError('sschart: drawing idFactory must return a non-empty string');
            const id = candidate.trim();
            if (!this.records.has(id)) return id;
            if (this.idFactory !== undefined)
                throw new Error(`sschart: drawing idFactory returned duplicate id '${id}'`);
        }
    }

    private nextZOrder(): number {
        let maximum = -1;
        for (const record of this.records.values())
            maximum = Math.max(maximum, record.instance.zOrder);
        return maximum + 1;
    }

    private emit(): void {
        if (this.disposed) return;
        const snapshot = this.drawings();
        for (const listener of this.listeners) {
            try { listener(snapshot); } catch { /* listeners are observers */ }
        }
    }

    private emitCreation(): void {
        if (this.disposed) return;
        const snapshot = this.creation();
        for (const listener of this.creationListeners) {
            try { listener(snapshot); } catch { /* listeners are observers */ }
        }
    }

    private assertAlive(): void {
        if (this.disposed) throw new Error('sschart: drawing controller is disposed');
    }
}

function validateBinding(binding: DrawingPrimitiveBinding, type: string): void {
    if (binding === null || typeof binding !== 'object'
        || binding.primitive === null || typeof binding.primitive !== 'object'
        || typeof binding.primitive.attached !== 'function'
        || typeof binding.primitive.detached !== 'function'
        || typeof binding.primitive.updateAllViews !== 'function'
        || typeof binding.update !== 'function') {
        throw new TypeError(`sschart: drawing type '${type}' returned an invalid primitive binding`);
    }
}

function sameInstance(left: DrawingInstance, right: DrawingInstance): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function freezeDrawingPoint(point: DrawingPoint): DrawingPoint {
    return Object.freeze({ time: point.time, price: point.price });
}

function samePoint(left: DrawingPoint | null, right: DrawingPoint | null): boolean {
    return left === right || (left !== null && right !== null
        && left.time === right.time && left.price === right.price);
}

const noOpPrimitiveEvents: DrawingPrimitiveEvents = Object.freeze({
    preview(): void {},
    commit(): void {},
    cancel(): void {},
});
