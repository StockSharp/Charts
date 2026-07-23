export interface OhlcData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface DerivedOhlcData {
    readonly data: readonly OhlcData[];
    readonly boxSize: number;
}

function finite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function evenSpan(source: ReadonlyArray<{ time: number }>, count: number): number[] {
    if (count <= 0) return [];
    const first = source[0].time;
    const last = source[source.length - 1].time;
    const times = new Array<number>(count);
    if (count === 1 || !(last > first)) {
        for (let index = 0; index < count; index++) times[index] = first + index;
        return times;
    }
    for (let index = 0; index < count; index++)
        times[index] = first + index / (count - 1) * (last - first);
    return times;
}

function renkoBox(source: readonly OhlcData[], requested?: number): number {
    if (finite(requested, 0) > 0) return requested as number;
    let low = Infinity;
    let high = -Infinity;
    for (const point of source) {
        low = Math.min(low, point.close);
        high = Math.max(high, point.close);
    }
    return ((Number.isFinite(high - low) && high > low) ? high - low : 1) / 40;
}

export function prepareRenkoData(source: readonly OhlcData[], requestedBoxSize?: number): DerivedOhlcData {
    const boxSize = renkoBox(source, requestedBoxSize);
    if (source.length < 2 || !(boxSize > 0)) return { data: [], boxSize };
    const bricks: Array<{ rising: boolean; low: number; high: number }> = [];
    let base = source[0].close;
    for (const point of source) {
        while (point.close >= base + boxSize) {
            bricks.push({ rising: true, low: base, high: base + boxSize });
            base += boxSize;
        }
        while (point.close <= base - boxSize) {
            bricks.push({ rising: false, low: base - boxSize, high: base });
            base -= boxSize;
        }
    }
    const times = evenSpan(source, bricks.length);
    return {
        boxSize,
        data: bricks.map((brick, index) => brick.rising
            ? { time: times[index], open: brick.low, high: brick.high, low: brick.low, close: brick.high }
            : { time: times[index], open: brick.high, high: brick.high, low: brick.low, close: brick.low }),
    };
}

function pointFigureBox(source: readonly OhlcData[], requested?: number): number {
    if (finite(requested, 0) > 0) return requested as number;
    let low = Infinity;
    let high = -Infinity;
    for (const point of source) {
        low = Math.min(low, point.low);
        high = Math.max(high, point.high);
    }
    return ((Number.isFinite(high - low) && high > low) ? high - low : 1) / 50;
}

export function preparePointFigureData(
    source: readonly OhlcData[],
    requestedBoxSize?: number,
    requestedReversal?: number,
): DerivedOhlcData {
    const boxSize = pointFigureBox(source, requestedBoxSize);
    if (source.length < 2 || !(boxSize > 0)) return { data: [], boxSize };
    const reversal = finite(requestedReversal, 2);
    const columns: Array<{ rising: boolean; low: number; high: number }> = [];
    let reference = Infinity;
    for (const point of source) reference = Math.min(reference, point.close);
    let direction = 0;
    let top = source[0].close;
    let bottom = source[0].close;
    for (const point of source) {
        const close = point.close;
        if (direction >= 0 && close >= top + boxSize) {
            direction = 1;
            top = Math.floor((close - reference) / boxSize) * boxSize + reference;
            const previous = columns[columns.length - 1];
            if (previous === undefined || !previous.rising)
                columns.push({ rising: true, low: bottom, high: top });
            else previous.high = top;
        } else if (direction <= 0 && close <= bottom - boxSize) {
            direction = -1;
            bottom = Math.ceil((close - reference) / boxSize) * boxSize + reference;
            const previous = columns[columns.length - 1];
            if (previous === undefined || previous.rising)
                columns.push({ rising: false, low: bottom, high: top });
            else previous.low = bottom;
        } else if (direction === 1 && close <= top - reversal * boxSize) {
            direction = -1;
            bottom = close;
            columns.push({ rising: false, low: bottom, high: top - boxSize });
        } else if (direction === -1 && close >= bottom + reversal * boxSize) {
            direction = 1;
            top = close;
            columns.push({ rising: true, low: bottom + boxSize, high: top });
        }
    }
    const times = evenSpan(source, columns.length);
    return {
        boxSize,
        data: columns.map((column, index) => column.rising
            ? { time: times[index], open: column.low, high: column.high, low: column.low, close: column.high }
            : { time: times[index], open: column.high, high: column.high, low: column.low, close: column.low }),
    };
}
