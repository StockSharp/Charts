import type { DataChangeKind, DataChangeSet } from './data-change-set.js';

export interface TimedValue {
    time: number;
}

export interface LogicalIndexRange {
    from: number;
    to: number;
}

export const MismatchDirection = {
    NearestLeft: -1,
    None: 0,
    NearestRight: 1,
} as const;

export type MismatchDirectionValue = typeof MismatchDirection[keyof typeof MismatchDirection];

export interface BarsInfo {
    barsBefore: number;
    barsAfter: number;
    from: number;
    to: number;
}

export interface IndexedData<TValue> {
    readonly from: number;
    readonly to: number;
    readonly points: readonly TValue[];
}

/** Sorted, versioned storage plus logarithmic time/index lookups. */
export class SeriesStore<TValue extends TimedValue> {
    private readonly items: TValue[] = [];
    private currentVersion = 0;

    get version(): number { return this.currentVersion; }
    get length(): number { return this.items.length; }
    get values(): readonly TValue[] { return this.items; }
    get first(): TValue | undefined { return this.items[0]; }
    get last(): TValue | undefined { return this.items[this.items.length - 1]; }

    replace(points: ReadonlyArray<TValue>): DataChangeSet {
        const previous = this.items.length;
        const ordered = points.slice().sort((a, b) => a.time - b.time);
        this.items.splice(0, previous, ...ordered);
        return this.change(ordered.length === 0 ? 'clear' : 'replace', 0, Math.max(0, ordered.length - 1), ordered.length, previous);
    }

    update(point: TValue): DataChangeSet | null {
        const last = this.last;
        if (last === undefined) {
            this.items.push(point);
            return this.change('append', 0, 0, 1, 0);
        }
        if (Number.isFinite(point.time) && Number.isFinite(last.time)) {
            if (point.time === last.time) {
                this.items[this.items.length - 1] = point;
                return this.change('update', this.items.length - 1, this.items.length - 1, 1, 1);
            }
            if (point.time < last.time) return null;
        } else {
            this.items[this.items.length - 1] = point;
            return this.change('update', this.items.length - 1, this.items.length - 1, 1, 1);
        }
        this.items.push(point);
        return this.change('append', this.items.length - 1, this.items.length - 1, 1, 0);
    }

    prepend(points: ReadonlyArray<TValue>): DataChangeSet | null {
        if (points.length === 0) return null;
        const ordered = points.slice().sort((a, b) => a.time - b.time);
        const first = this.first;
        let removed = 0;
        if (first !== undefined) {
            const newest = ordered[ordered.length - 1];
            if (newest.time > first.time)
                throw new Error('sschart: prependData points must not be newer than existing data');
            if (newest.time === first.time) {
                ordered.pop();
                this.items.shift();
                ordered.push(newest);
                removed = 1;
            }
        }
        if (ordered.length === 0) return null;
        this.items.unshift(...ordered);
        return this.change('prepend', 0, ordered.length - 1, ordered.length, removed);
    }

    pop(count = 1): { points: TValue[]; change: DataChangeSet | null } {
        const amount = Math.min(this.items.length, Math.max(0, Math.floor(count)));
        if (amount === 0) return { points: [], change: null };
        const from = this.items.length - amount;
        const points = this.items.splice(from, amount);
        return { points, change: this.change('pop', from, from, 0, amount) };
    }

    snapshot(): readonly TValue[] { return this.items.slice(); }

    dataByIndex(index: number, mismatchDirection: MismatchDirectionValue = MismatchDirection.None): TValue | null {
        if (this.items.length === 0 || !Number.isFinite(index)) return null;
        const exact = Math.trunc(index);
        if (exact >= 0 && exact < this.items.length) return this.items[exact];
        if (mismatchDirection === MismatchDirection.NearestLeft && exact >= this.items.length)
            return this.last ?? null;
        if (mismatchDirection === MismatchDirection.NearestRight && exact < 0)
            return this.first ?? null;
        return null;
    }

    pointAtTime(time: number): TValue | null {
        const index = this.lowerBound(time);
        return index < this.items.length && this.items[index].time === time ? this.items[index] : null;
    }

    nearest(time: number): TValue | null {
        if (this.items.length === 0) return null;
        const right = this.lowerBound(time);
        if (right <= 0) return this.items[0];
        if (right >= this.items.length) return this.items[this.items.length - 1];
        const left = right - 1;
        return Math.abs(this.items[left].time - time) <= Math.abs(this.items[right].time - time)
            ? this.items[left]
            : this.items[right];
    }

    visibleRange(fromTime: number, toTime: number, neighbourPadding = 0): IndexedData<TValue> {
        if (this.items.length === 0 || !(toTime >= fromTime)) return { from: 0, to: -1, points: [] };
        const from = Math.max(0, this.lowerBound(fromTime) - neighbourPadding);
        const exclusiveTo = Math.min(this.items.length, this.upperBound(toTime) + neighbourPadding);
        return {
            from,
            to: exclusiveTo - 1,
            points: this.items.slice(from, exclusiveTo),
        };
    }

    barsInLogicalRange(range: LogicalIndexRange): BarsInfo | null {
        if (this.items.length === 0 || range === null || !(range.to >= range.from)) return null;
        const firstIndex = Math.max(0, Math.ceil(range.from));
        const lastIndex = Math.min(this.items.length - 1, Math.floor(range.to));
        if (lastIndex < firstIndex) return null;
        return {
            barsBefore: firstIndex,
            barsAfter: this.items.length - 1 - lastIndex,
            from: this.items[firstIndex].time,
            to: this.items[lastIndex].time,
        };
    }

    lowerBound(time: number): number {
        let low = 0;
        let high = this.items.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this.items[middle].time < time) low = middle + 1;
            else high = middle;
        }
        return low;
    }

    upperBound(time: number): number {
        let low = 0;
        let high = this.items.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this.items[middle].time <= time) low = middle + 1;
            else high = middle;
        }
        return low;
    }

    private change(
        kind: DataChangeKind,
        fromIndex: number,
        toIndex: number,
        added: number,
        removed: number,
    ): DataChangeSet {
        this.currentVersion++;
        return { kind, version: this.currentVersion, fromIndex, toIndex, added, removed };
    }
}
