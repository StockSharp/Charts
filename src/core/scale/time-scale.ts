export interface TimeRange {
    from: number;
    to: number;
}

/** Canonical time-domain state shared by every pane in a chart. */
export class TimeScaleModel {
    dataFrom = 0;
    dataTo = 1;
    visibleFrom = 0;
    visibleTo = 1;

    get dataRange(): TimeRange { return { from: this.dataFrom, to: this.dataTo }; }
    get visibleRange(): TimeRange | null {
        return this.visibleTo > this.visibleFrom
            ? { from: this.visibleFrom, to: this.visibleTo }
            : null;
    }

    updateDataRange(from: number, to: number): boolean {
        if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) return false;
        this.dataFrom = from;
        this.dataTo = to;
        const noOverlap = this.visibleTo < from || this.visibleFrom > to;
        if (this.visibleTo <= this.visibleFrom || noOverlap) {
            this.visibleFrom = from;
            this.visibleTo = to;
        }
        return true;
    }

    fitContent(): boolean {
        if (!(this.dataTo > this.dataFrom)) return false;
        this.visibleFrom = this.dataFrom;
        this.visibleTo = this.dataTo;
        return true;
    }

    scrollToRealTime(gapRatio = 0.04): boolean {
        const width = this.visibleTo - this.visibleFrom;
        if (!(width > 0) || !Number.isFinite(this.dataTo)) return false;
        this.visibleTo = this.dataTo + width * gapRatio;
        this.visibleFrom = this.visibleTo - width;
        return true;
    }

    setVisibleRange(range: TimeRange, clampToData = true): boolean {
        if (range === null || !(range.to > range.from)) return false;
        if (clampToData) this.clampVisibleRange(range.from, range.to);
        else {
            this.visibleFrom = range.from;
            this.visibleTo = range.to;
        }
        return true;
    }

    clampVisibleRange(nextFrom: number, nextTo: number): void {
        const dataSpan = (this.dataTo - this.dataFrom) || 1;
        const minSpan = dataSpan * 0.004;
        const maxSpan = dataSpan * 3;
        let span = nextTo - nextFrom;
        if (!(span > 0)) {
            span = dataSpan;
            nextFrom = this.dataFrom;
            nextTo = this.dataTo;
        }
        if (span < minSpan || span > maxSpan) {
            span = Math.min(Math.max(span, minSpan), maxSpan);
            const center = (nextFrom + nextTo) / 2;
            nextFrom = center - span / 2;
            nextTo = center + span / 2;
        }
        const minimum = this.dataFrom - dataSpan * 0.5;
        const maximum = this.dataTo + dataSpan * 0.5;
        if (nextFrom < minimum) {
            nextTo += minimum - nextFrom;
            nextFrom = minimum;
        }
        if (nextTo > maximum) {
            nextFrom -= nextTo - maximum;
            nextTo = maximum;
        }
        this.visibleFrom = Math.max(nextFrom, minimum);
        this.visibleTo = Math.min(nextTo, maximum);
    }
}
