import { DisposableStore, type IDisposable } from '../disposable.js';
import type {
    IChartPrimitive,
    PrimitiveAttachedContext,
    PrimitiveAttachOptions,
    PrimitiveDisposable,
} from './primitive-api.js';

export interface PrimitiveLifecycleServices {
    readonly requestUpdate: () => void;
    readonly addDisposable: (resource: PrimitiveDisposable) => void;
}

export type PrimitiveContextFactory = (
    services: PrimitiveLifecycleServices,
) => PrimitiveAttachedContext;

interface PrimitiveRecord {
    readonly primitive: IChartPrimitive;
    options: PrimitiveAttachOptions;
    readonly resources: DisposableStore;
    active: boolean;
}

export interface PrimitiveAttachment {
    readonly primitive: IChartPrimitive;
    readonly options: PrimitiveAttachOptions;
}

/** Owns primitive attachments and guarantees exactly-once teardown. */
export class PrimitiveHost implements IDisposable {
    private readonly records = new Map<IChartPrimitive, PrimitiveRecord>();
    private readonly attachmentOrder: PrimitiveRecord[] = [];
    private attachmentSnapshot: readonly PrimitiveAttachment[] = Object.freeze([]);
    private disposed = false;

    constructor(private readonly invalidate: () => void) {}

    get size(): number { return this.records.size; }

    primitives(): readonly IChartPrimitive[] {
        return this.attachmentOrder.map((record) => record.primitive);
    }

    attachments(): readonly PrimitiveAttachment[] {
        return this.attachmentSnapshot;
    }

    /** Re-routes an attachment without restarting its lifecycle or resources. */
    updateOptions(primitive: IChartPrimitive, options: PrimitiveAttachOptions): boolean {
        if (this.disposed) throw new Error('sschart: primitive host is disposed');
        const record = this.records.get(primitive);
        if (record === undefined || !record.active) return false;
        record.options = Object.freeze({ ...options });
        this.rebuildSnapshot();
        try { primitive.updateAllViews(); } catch { /* routing must remain structural */ }
        this.invalidate();
        return true;
    }

    updateAllViews(): void {
        for (const record of this.attachmentOrder) {
            if (record.active) record.primitive.updateAllViews();
        }
    }

    attach(
        primitive: IChartPrimitive,
        options: PrimitiveAttachOptions,
        createContext: PrimitiveContextFactory,
    ): void {
        if (this.disposed) throw new Error('sschart: primitive host is disposed');
        if (this.records.has(primitive)) throw new Error('sschart: primitive is already attached');

        const record: PrimitiveRecord = {
            primitive,
            options: Object.freeze({ ...options }),
            resources: new DisposableStore(),
            active: true,
        };
        this.records.set(primitive, record);
        this.attachmentOrder.push(record);
        this.rebuildSnapshot();

        const services: PrimitiveLifecycleServices = {
            requestUpdate: () => {
                if (!record.active || this.disposed) return;
                this.invalidate();
            },
            addDisposable: (resource) => this.addResource(record, resource),
        };

        let attachedStarted = false;
        try {
            const context = createContext(services);
            attachedStarted = true;
            primitive.attached(context);
            if (!record.active) return;
            primitive.updateAllViews();
            this.invalidate();
        } catch (error) {
            if (record.active) {
                try { this.detachRecord(record, false, attachedStarted); } catch { /* preserve attach failure */ }
            }
            throw error;
        }
    }

    detach(primitive: IChartPrimitive): boolean {
        const record = this.records.get(primitive);
        if (record === undefined) return false;
        this.detachRecord(record, true);
        return true;
    }

    detachWhere(predicate: (options: PrimitiveAttachOptions) => boolean): void {
        for (const record of [...this.attachmentOrder].reverse()) {
            if (!record.active || !predicate(record.options)) continue;
            try { this.detachRecord(record, true); } catch { /* structural owner removal must continue */ }
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const record of [...this.attachmentOrder].reverse()) {
            try { this.detachRecord(record, false); } catch { /* release remaining primitives */ }
        }
    }

    private addResource(record: PrimitiveRecord, resource: PrimitiveDisposable): void {
        if (typeof resource === 'function') {
            record.resources.defer(resource);
            return;
        }
        if (resource === null || typeof resource !== 'object' || typeof resource.dispose !== 'function')
            throw new TypeError('sschart: primitive disposable must be a callback or IDisposable');
        record.resources.add(resource);
    }

    private detachRecord(record: PrimitiveRecord, invalidate: boolean, notifyPrimitive = true): void {
        if (!record.active) return;
        record.active = false;
        this.records.delete(record.primitive);
        const index = this.attachmentOrder.indexOf(record);
        if (index >= 0) this.attachmentOrder.splice(index, 1);
        this.rebuildSnapshot();

        try {
            if (notifyPrimitive) record.primitive.detached();
        } finally {
            record.resources.dispose();
            if (invalidate && !this.disposed) this.invalidate();
        }
    }

    private rebuildSnapshot(): void {
        this.attachmentSnapshot = Object.freeze(this.attachmentOrder.map((record) => Object.freeze({
            primitive: record.primitive,
            options: record.options,
        })));
    }
}
