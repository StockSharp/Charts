import { SeriesStore, type TimedValue } from './series-store.js';
import type { DataChangeSet } from './data-change-set.js';

export type { TimedValue } from './series-store.js';

/** Owns ordered series data independently from rendering and public handles. */
export class SeriesModel<TValue extends TimedValue> {
    readonly store = new SeriesStore<TValue>();
    get values(): readonly TValue[] { return this.store.values; }

    replaceData(points: ReadonlyArray<TValue>): DataChangeSet {
        return this.store.replace(points);
    }

    /** Returns true when the current tail changed. Older updates are ignored. */
    updateTail(point: TValue): DataChangeSet | null {
        return this.store.update(point);
    }

    clear(): void {
        this.store.replace([]);
    }
}
