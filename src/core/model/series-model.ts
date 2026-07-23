export interface TimedValue {
    time: number;
}

/** Owns ordered series data independently from rendering and public handles. */
export class SeriesModel<TValue extends TimedValue> {
    readonly data: TValue[] = [];

    replaceData(points: ReadonlyArray<TValue>): void {
        const ordered = points.slice().sort((a, b) => a.time - b.time);
        this.data.splice(0, this.data.length, ...ordered);
    }

    /** Returns true when the current tail changed. Older updates are ignored. */
    updateTail(point: TValue): boolean {
        const last = this.data[this.data.length - 1];
        if (last === undefined) {
            this.data.push(point);
            return true;
        }
        if (Number.isFinite(point.time) && Number.isFinite(last.time)) {
            if (point.time === last.time) this.data[this.data.length - 1] = point;
            else if (point.time > last.time) this.data.push(point);
            else return false;
        } else {
            this.data[this.data.length - 1] = point;
        }
        return true;
    }

    clear(): void {
        this.data.length = 0;
    }
}
