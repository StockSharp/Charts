import {
    type CustomSeriesDefinition,
    type PreparedSeriesData,
    type SeriesPriceRange,
    type SeriesRendererContext,
    type SeriesRendererRegistry,
    type TimedSeriesData,
} from './registry.js';
import { preparePointFigureData, prepareRenkoData } from './derived-data.js';

type Point = TimedSeriesData & {
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    value?: number;
    upper?: number;
    lower?: number;
    color?: string;
    vol?: number;
    levels?: Array<{ price: number; vol: number }>;
};

type Options = Record<string, unknown> & {
    upColor?: string;
    downColor?: string;
    borderVisible?: boolean;
    borderUpColor?: string;
    borderDownColor?: string;
    wickUpColor?: string;
    wickDownColor?: string;
    color?: string;
    lineColor?: string;
    lineWidth?: number;
    lineStyle?: number;
    lineVisible?: boolean;
    pointMarkersVisible?: boolean;
    pointMarkersRadius?: number;
    topColor?: string;
    bottomColor?: string;
    upperColor?: string;
    lowerColor?: string;
    fillColor?: string;
    positiveFillColor?: string;
    negativeFillColor?: string;
    base?: number;
    boxSize?: number;
    reversal?: number;
};

type Context = SeriesRendererContext<Point, Options>;

function finite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function dash(style: number, width: number): number[] {
    switch (style) {
        case 1: return [width, width];
        case 2: return [width * 3, width * 2];
        case 3: return [width * 6, width * 3];
        case 4: return [width, width * 4];
        default: return [];
    }
}

function scan(
    data: readonly Point[],
    values: (point: Point) => readonly number[],
): SeriesPriceRange | null {
    let min = Infinity;
    let max = -Infinity;
    for (const point of data) {
        for (const value of values(point)) {
            if (!Number.isFinite(value)) continue;
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
    }
    return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

const ohlcRange = (data: readonly Point[]) => scan(data, (point) => [point.low!, point.high!]);
const valueRange = (data: readonly Point[]) => scan(data, (point) => [point.value!]);
const bandRange = (data: readonly Point[]) => scan(data, (point) => [point.lower!, point.upper!]);
const ohlcValue = (point: Point) => Number.isFinite(point.close) ? point.close! : null;
const singleValue = (point: Point) => Number.isFinite(point.value) ? point.value! : null;
const defaultColor = (_point: Point, options: Readonly<Options>) =>
    options.lineColor ?? options.color ?? '#89b4ff';
const candleColor = (point: Point, options: Readonly<Options>) => point.close! >= point.open!
    ? (options.upColor ?? '#31c15b')
    : (options.downColor ?? '#ff6d6d');
const histogramColor = (point: Point, options: Readonly<Options>) =>
    point.color ?? options.color ?? '#4aa3ff';

function histogramRange(data: readonly Point[], options: Readonly<Options>): SeriesPriceRange | null {
    const base = finite(options.base, 0);
    return scan(data, (point) => [point.value!, base]);
}

function drawCandlestick(c: Context): void {
    const { target: ctx, options: o } = c;
    const width = Math.max(1, c.barSpacing * 0.72);
    for (const point of c.data) {
        if (![point.open, point.high, point.low, point.close].every(Number.isFinite)) continue;
        const x = c.timeToCoordinate(point.time);
        const up = point.close! >= point.open!;
        const body = up ? (o.upColor ?? '#31c15b') : (o.downColor ?? '#ff6d6d');
        const wick = up ? (o.wickUpColor ?? body) : (o.wickDownColor ?? body);
        ctx.strokeStyle = wick;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, c.priceToCoordinate(point.high!));
        ctx.lineTo(Math.round(x) + 0.5, c.priceToCoordinate(point.low!));
        ctx.stroke();
        const yOpen = c.priceToCoordinate(point.open!);
        const yClose = c.priceToCoordinate(point.close!);
        const bx = Math.round(x - width / 2);
        const bodyWidth = Math.max(1, Math.round(width));
        const top = Math.round(Math.min(yOpen, yClose));
        const height = Math.max(1, Math.round(Math.abs(yClose - yOpen)));
        ctx.fillStyle = body;
        ctx.fillRect(bx, top, bodyWidth, height);
        const border = up ? o.borderUpColor : o.borderDownColor;
        if (o.borderVisible !== false && border && border !== body && height > 2) {
            ctx.strokeStyle = border;
            ctx.strokeRect(bx + 0.5, top + 0.5, bodyWidth - 1, height - 1);
        }
    }
}

function drawBar(c: Context): void {
    const { target: ctx, options: o } = c;
    const tick = Math.max(2, c.barSpacing * 0.36);
    ctx.lineWidth = Math.max(1, Math.min(3, c.barSpacing * 0.12));
    for (const point of c.data) {
        if (![point.open, point.high, point.low, point.close].every(Number.isFinite)) continue;
        const x = Math.round(c.timeToCoordinate(point.time)) + 0.5;
        ctx.strokeStyle = point.close! >= point.open!
            ? (o.upColor ?? '#00c853')
            : (o.downColor ?? '#ff3d57');
        ctx.beginPath();
        ctx.moveTo(x, c.priceToCoordinate(point.high!));
        ctx.lineTo(x, c.priceToCoordinate(point.low!));
        ctx.moveTo(x - tick, c.priceToCoordinate(point.open!));
        ctx.lineTo(x, c.priceToCoordinate(point.open!));
        ctx.moveTo(x, c.priceToCoordinate(point.close!));
        ctx.lineTo(x + tick, c.priceToCoordinate(point.close!));
        ctx.stroke();
    }
}

function drawCluster(c: Context): void {
    const { target: ctx, options: o } = c;
    const slot = Math.max(6, c.barSpacing);
    for (const point of c.data) {
        const levels = point.levels;
        if (!levels?.length || !Number.isFinite(point.high) || !Number.isFinite(point.low)) continue;
        const center = c.timeToCoordinate(point.time);
        let maximum = 0;
        for (const level of levels) maximum = Math.max(maximum, level.vol);
        if (maximum <= 0) continue;
        const cellHeight = Math.max(1,
            Math.abs(c.priceToCoordinate(point.high!) - c.priceToCoordinate(point.low!)) / levels.length);
        for (const level of levels) {
            const y = c.priceToCoordinate(level.price);
            const width = (level.vol / maximum) * (slot * 0.92);
            ctx.fillStyle = level.vol === maximum ? '#fcd535' : (o.color ?? 'rgba(74,158,255,0.55)');
            ctx.fillRect(center - slot * 0.46, y - cellHeight / 2, width, Math.max(1, cellHeight - 0.5));
        }
    }
}

function drawBox(c: Context): void {
    const { target: ctx, options: o, pane } = c;
    const slot = Math.max(2, c.barSpacing);
    const span = (c.priceRange.max - c.priceRange.min) || 1;
    const rows = Math.max(5, Math.min(60, Math.round(pane.height / 20)));
    const rowHeight = pane.height / rows;
    const columns = c.data.map((point) => {
        const values = new Array<number>(rows).fill(0);
        for (const level of point.levels ?? []) {
            const row = Math.max(0, Math.min(rows - 1,
                Math.floor((level.price - c.priceRange.min) / span * rows)));
            values[row] += level.vol;
        }
        return values;
    });
    let maximum = 0;
    for (const column of columns) for (const value of column) maximum = Math.max(maximum, value);
    if (maximum <= 0) return;
    const showText = slot >= 26 && rowHeight >= 11;
    const fontSize = Math.max(7, Math.min(Math.floor(rowHeight - 3), Math.floor(slot * 0.4)));
    ctx.strokeStyle = c.theme.horizontalGridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let row = 0; row <= rows; row++) {
        const y = Math.round(pane.bottom - row * rowHeight) + 0.5;
        ctx.moveTo(pane.left, y);
        ctx.lineTo(pane.right, y);
    }
    ctx.stroke();
    ctx.font = `${fontSize}px ${c.theme.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    c.data.forEach((point, columnIndex) => {
        const center = c.timeToCoordinate(point.time);
        if (showText) {
            ctx.strokeStyle = c.theme.verticalGridColor;
            ctx.strokeRect(Math.round(center - slot / 2) + 0.5, pane.top + 0.5,
                Math.round(slot), Math.round(pane.height));
        }
        const column = columns[columnIndex];
        for (let row = 0; row < rows; row++) {
            const value = column[row];
            if (value <= 0) continue;
            const y = pane.bottom - (row + 0.5) * rowHeight;
            if (showText) {
                ctx.fillStyle = value === maximum ? '#fcd535' : c.theme.textColor;
                ctx.fillText(String(value), center, y, slot - 3);
            } else {
                const alpha = 0.12 + 0.6 * (value / maximum);
                ctx.fillStyle = value === maximum ? 'rgba(252,213,53,0.8)' : `rgba(74,158,255,${alpha})`;
                ctx.fillRect(center - slot / 2, y - rowHeight / 2, slot, Math.max(1, rowHeight - 1));
            }
        }
    });
}

function drawRenko(c: Context): void {
    const { target: ctx, options: o } = c;
    const width = c.allData.length > 1
        ? Math.max(2, Math.abs(c.timeToCoordinate(c.allData[1].time)
            - c.timeToCoordinate(c.allData[0].time)) * 0.85)
        : Math.max(3, c.barSpacing);
    for (const point of c.data) {
        if (![point.open, point.high, point.low, point.close].every(Number.isFinite)) continue;
        const x = c.timeToCoordinate(point.time);
        const top = c.priceToCoordinate(point.high!);
        const bottom = c.priceToCoordinate(point.low!);
        ctx.fillStyle = point.close! >= point.open! ? (o.upColor ?? '#00c853') : (o.downColor ?? '#ff3d57');
        ctx.fillRect(x - width / 2, Math.min(top, bottom), width, Math.max(1, Math.abs(bottom - top)));
    }
}

function drawPointFigure(c: Context): void {
    const { target: ctx, options: o } = c;
    const box = finite(c.metadata.box, 1);
    if (!(box > 0) || c.allData.length === 0) return;
    const width = c.allData.length > 1
        ? Math.abs(c.timeToCoordinate(c.allData[1].time) - c.timeToCoordinate(c.allData[0].time))
        : c.barSpacing;
    const boxPixels = Math.abs(c.priceToCoordinate(c.priceRange.min + box)
        - c.priceToCoordinate(c.priceRange.min));
    const radius = Math.max(2, Math.min(width * 0.4, boxPixels * 0.45));
    ctx.lineWidth = 1.5;
    for (const point of c.data) {
        if (![point.open, point.high, point.low, point.close].every(Number.isFinite)) continue;
        const center = c.timeToCoordinate(point.time);
        const rising = point.close! >= point.open!;
        ctx.strokeStyle = rising ? (o.upColor ?? '#00c853') : (o.downColor ?? '#ff3d57');
        for (let value = point.low!; value <= point.high! + 1e-6; value += box) {
            const y = c.priceToCoordinate(value + box / 2);
            ctx.beginPath();
            if (rising) {
                ctx.moveTo(center - radius, y - radius); ctx.lineTo(center + radius, y + radius);
                ctx.moveTo(center + radius, y - radius); ctx.lineTo(center - radius, y + radius);
            } else {
                ctx.arc(center, y, radius, 0, Math.PI * 2);
            }
            ctx.stroke();
        }
    }
}

function drawHistogram(c: Context): void {
    const { target: ctx, options: o } = c;
    const width = Math.max(1, c.barSpacing * 0.8 - 1);
    const base = c.priceToCoordinate(finite(o.base, 0));
    for (const point of c.data) {
        if (!Number.isFinite(point.value)) continue;
        const x = c.timeToCoordinate(point.time);
        const y = c.priceToCoordinate(point.value!);
        ctx.fillStyle = point.color ?? o.color ?? '#4aa3ff';
        ctx.fillRect(x - width / 2, Math.min(y, base), width, Math.max(1, Math.abs(y - base)));
    }
}

function drawBand(c: Context): void {
    const { target: ctx, options: o } = c;
    const points = c.data.filter((point) => Number.isFinite(point.upper) && Number.isFinite(point.lower));
    if (points.length === 0) return;
    for (let index = 0; index < points.length - 1; index++) {
        const point = points[index];
        const next = points[index + 1];
        const positive = point.upper! + next.upper! >= point.lower! + next.lower!;
        ctx.beginPath();
        ctx.moveTo(c.timeToCoordinate(point.time), c.priceToCoordinate(point.upper!));
        ctx.lineTo(c.timeToCoordinate(next.time), c.priceToCoordinate(next.upper!));
        ctx.lineTo(c.timeToCoordinate(next.time), c.priceToCoordinate(next.lower!));
        ctx.lineTo(c.timeToCoordinate(point.time), c.priceToCoordinate(point.lower!));
        ctx.closePath();
        ctx.fillStyle = positive
            ? (o.positiveFillColor ?? o.fillColor ?? 'rgba(50,205,50,0.16)')
            : (o.negativeFillColor ?? o.fillColor ?? 'rgba(255,61,87,0.16)');
        ctx.fill();
    }
    const width = finite(o.lineWidth, 1);
    const drawBoundary = (key: 'upper' | 'lower', color: string) => {
        ctx.beginPath();
        points.forEach((point, index) => {
            const x = c.timeToCoordinate(point.time);
            const y = c.priceToCoordinate(point[key]!);
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash(finite(o.lineStyle, 0), width));
        ctx.stroke();
        ctx.setLineDash([]);
    };
    drawBoundary('upper', o.upperColor ?? o.color ?? '#32CD32');
    drawBoundary('lower', o.lowerColor ?? o.color ?? '#FF1493');
}

function drawLineLike(c: Context, area: boolean): void {
    const { target: ctx, options: o, pane } = c;
    const points = c.data.filter((point) => Number.isFinite(point.value));
    if (points.length === 0) return;
    const color = o.lineColor ?? o.color ?? '#89b4ff';
    const width = finite(o.lineWidth, area ? 2 : 1);
    ctx.lineJoin = 'round';
    if (area) {
        const gradient = ctx.createLinearGradient(0, pane.top, 0, pane.bottom);
        gradient.addColorStop(0, o.topColor ?? 'rgba(74,163,255,0.35)');
        gradient.addColorStop(1, o.bottomColor ?? 'rgba(74,163,255,0.02)');
        ctx.beginPath();
        points.forEach((point, index) => {
            const x = c.timeToCoordinate(point.time);
            const y = c.priceToCoordinate(point.value!);
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.lineTo(c.timeToCoordinate(points[points.length - 1].time), pane.bottom);
        ctx.lineTo(c.timeToCoordinate(points[0].time), pane.bottom);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
    }
    if (o.lineVisible !== false) {
        ctx.beginPath();
        points.forEach((point, index) => {
            const x = c.timeToCoordinate(point.time);
            const y = c.priceToCoordinate(point.value!);
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash(finite(o.lineStyle, 0), width));
        ctx.stroke();
        ctx.setLineDash([]);
    }
    if (o.pointMarkersVisible) {
        const radius = Math.max(1, finite(o.pointMarkersRadius, 3));
        ctx.fillStyle = color;
        for (const point of points) {
            ctx.beginPath();
            ctx.arc(c.timeToCoordinate(point.time), c.priceToCoordinate(point.value!), radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawVolumeProfile(c: Context): void {
    const { target: ctx, options: o, pane } = c;
    if (c.data.length === 0) return;
    const span = (c.priceRange.max - c.priceRange.min) || 1;
    const bins = Math.max(12, Math.min(90, Math.round(pane.height / 8)));
    const step = span / bins;
    const aggregate = new Array<number>(bins).fill(0);
    for (const point of c.data) {
        if (!Number.isFinite(point.high) || !Number.isFinite(point.low)) continue;
        const volume = Number.isFinite(point.vol) ? point.vol! : 1;
        const from = Math.max(0, Math.min(bins - 1, Math.floor((point.low! - c.priceRange.min) / step)));
        const to = Math.max(0, Math.min(bins - 1, Math.floor((point.high! - c.priceRange.min) / step)));
        const value = volume / (to - from + 1);
        for (let bin = from; bin <= to; bin++) aggregate[bin] += value;
    }
    let maximum = 0;
    for (const value of aggregate) maximum = Math.max(maximum, value);
    if (maximum <= 0) return;
    const maximumWidth = pane.width * 0.22;
    const height = Math.max(1, pane.height / bins - 1);
    ctx.fillStyle = o.color ?? 'rgba(74,158,255,0.16)';
    for (let bin = 0; bin < bins; bin++) {
        if (aggregate[bin] <= 0) continue;
        const width = aggregate[bin] / maximum * maximumWidth;
        const y = c.priceToCoordinate(c.priceRange.min + (bin + 0.5) * step);
        ctx.fillRect(pane.right - width, y - height / 2, width, height);
    }
}

function definition(
    type: string,
    draw: (context: Context) => void,
    priceRange: (data: readonly Point[], options: Readonly<Options>) => SeriesPriceRange | null,
    priceValue: (point: Point, options: Readonly<Options>) => number | null,
    dataPadding = 1,
    colorAt: (point: Point, options: Readonly<Options>) => string | null = defaultColor,
    extras: {
        dataProcessor?: (data: readonly Point[], options: Readonly<Options>) => PreparedSeriesData<Point>;
        affectsTimeScale?: boolean;
        magnetValues?: (point: Point, options: Readonly<Options>) => readonly number[];
    } = {},
): CustomSeriesDefinition<Point, Options> {
    const renderer = Object.freeze({
        draw,
        priceRange,
        priceValue,
        dataPadding,
        colorAt,
        magnetValues: extras.magnetValues,
    });
    return Object.freeze({
        type,
        defaultOptions: Object.freeze({}) as Options,
        renderer,
        dataProcessor: extras.dataProcessor,
        affectsTimeScale: extras.affectsTimeScale,
    });
}

const ohlcMagnetValues = (point: Point) => [point.open!, point.high!, point.low!, point.close!];
const renkoProcessor = (data: readonly Point[], options: Readonly<Options>): PreparedSeriesData<Point> => {
    const prepared = prepareRenkoData(data as readonly Required<Pick<Point, 'time' | 'open' | 'high' | 'low' | 'close'>>[], options.boxSize);
    return { data: prepared.data as readonly Point[], metadata: { box: prepared.boxSize } };
};
const pointFigureProcessor = (data: readonly Point[], options: Readonly<Options>): PreparedSeriesData<Point> => {
    const prepared = preparePointFigureData(
        data as readonly Required<Pick<Point, 'time' | 'open' | 'high' | 'low' | 'close'>>[],
        options.boxSize,
        options.reversal,
    );
    return { data: prepared.data as readonly Point[], metadata: { box: prepared.boxSize } };
};

export const builtInSeriesDefinitions = [
    definition('Candlestick', drawCandlestick, ohlcRange, ohlcValue, 1, candleColor,
        { magnetValues: ohlcMagnetValues }),
    definition('Bar', drawBar, ohlcRange, ohlcValue, 1, candleColor,
        { magnetValues: ohlcMagnetValues }),
    definition('Line', (context) => drawLineLike(context, false), valueRange, singleValue),
    definition('Histogram', drawHistogram, histogramRange, singleValue, 1, histogramColor),
    definition('Area', (context) => drawLineLike(context, true), valueRange, singleValue),
    definition('Band', drawBand, bandRange, (point) => Number.isFinite(point.upper) ? point.upper! : null),
    definition('PointFigure', drawPointFigure, ohlcRange, ohlcValue, 1, candleColor,
        { dataProcessor: pointFigureProcessor }),
    definition('Renko', drawRenko, ohlcRange, ohlcValue, 1, candleColor,
        { dataProcessor: renkoProcessor }),
    definition('VolumeProfile', drawVolumeProfile, () => null, () => null, 0, defaultColor,
        { affectsTimeScale: false }),
    definition('Cluster', drawCluster, ohlcRange, ohlcValue),
    definition('Box', drawBox, ohlcRange, ohlcValue),
] as const;

export function registerBuiltInSeries(registry: SeriesRendererRegistry): void {
    for (const item of builtInSeriesDefinitions) registry.register(item);
}
