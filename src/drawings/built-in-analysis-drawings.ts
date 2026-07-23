import type { LineStyleValue, PrimitiveRect } from '../core/chart-api.js';
import { concisePrice, lineDash, pointSegmentDistance } from '../primitives/drawing-utils.js';
import type { DrawingInstance, DrawingOptions } from './drawing-model.js';
import {
    DrawingDefinitionRegistry,
    type DrawingDefinition,
    type DrawingPrimitiveEvents,
} from './drawing-registry.js';
import { BuiltInDrawingType } from './built-in-line-drawings.js';
import {
    createInteractiveDrawingBinding,
    type DrawingPrimitiveDrawContext,
    type DrawingPrimitiveGeometryContext,
    type DrawingPrimitiveVisual,
    type DrawingScreenPoint,
} from './interactive-drawing-primitive.js';

export interface FibonacciDrawingOptions extends DrawingOptions {
    readonly color: string;
    readonly lineWidth: number;
    readonly lineStyle: LineStyleValue;
    readonly fillColor: string;
    readonly levels: readonly number[];
    readonly labelsVisible: boolean;
    readonly fontSize: number;
    readonly extendRight: boolean;
}

export interface MeasureDrawingOptions extends DrawingOptions {
    readonly color: string;
    readonly lineWidth: number;
    readonly fillColor: string;
    readonly labelColor: string;
    readonly labelBackgroundColor: string;
    readonly fontSize: number;
}

interface FibonacciLevel {
    readonly ratio: number;
    readonly price: number;
    readonly y: number;
}

const fibonacciDefaults: FibonacciDrawingOptions = Object.freeze({
    color: '#787b86',
    lineWidth: 1,
    lineStyle: 0,
    fillColor: 'rgba(41,98,255,0.08)',
    levels: Object.freeze([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]),
    labelsVisible: true,
    fontSize: 11,
    extendRight: false,
});

const measureDefaults: MeasureDrawingOptions = Object.freeze({
    color: '#26a69a',
    lineWidth: 1,
    fillColor: 'rgba(38,166,154,0.12)',
    labelColor: '#ffffff',
    labelBackgroundColor: 'rgba(20,26,35,0.92)',
    fontSize: 12,
});

const fibonacciDefinition: DrawingDefinition<FibonacciDrawingOptions> = Object.freeze({
    type: BuiltInDrawingType.FibonacciRetracement,
    name: 'Fibonacci Retracement',
    points: Object.freeze({ min: 2, max: 2 }),
    defaultOptions: fibonacciDefaults,
    normalizeOptions: normalizeFibonacciOptions,
    create(
        instance: DrawingInstance<FibonacciDrawingOptions>,
        events: DrawingPrimitiveEvents<FibonacciDrawingOptions>,
    ) {
        return createInteractiveDrawingBinding(instance, events, fibonacciVisual);
    },
});

const measureDefinition: DrawingDefinition<MeasureDrawingOptions> = Object.freeze({
    type: BuiltInDrawingType.Measure,
    name: 'Measure',
    points: Object.freeze({ min: 2, max: 2 }),
    defaultOptions: measureDefaults,
    normalizeOptions: normalizeMeasureOptions,
    create(
        instance: DrawingInstance<MeasureDrawingOptions>,
        events: DrawingPrimitiveEvents<MeasureDrawingOptions>,
    ) {
        return createInteractiveDrawingBinding(instance, events, measureVisual());
    },
});

export const builtInAnalysisDrawingDefinitions = Object.freeze([
    fibonacciDefinition,
    measureDefinition,
] as const);

export function registerBuiltInAnalysisDrawings(registry: DrawingDefinitionRegistry): void {
    registry.register(fibonacciDefinition);
    registry.register(measureDefinition);
}

const fibonacciVisual: DrawingPrimitiveVisual = Object.freeze({
    draw(context: DrawingPrimitiveDrawContext): void {
        const geometry = fibonacciGeometry(context);
        if (geometry === null) return;
        const { levels, left, right, options } = geometry;
        const ordered = [...levels].sort((first, second) => first.y - second.y);
        context.context.fillStyle = options.fillColor;
        for (let index = 0; index + 1 < ordered.length; index += 2) {
            context.context.fillRect(
                left,
                ordered[index].y,
                right - left,
                ordered[index + 1].y - ordered[index].y,
            );
        }
        context.context.strokeStyle = options.color;
        context.context.lineWidth = options.lineWidth;
        context.context.setLineDash([...lineDash(options.lineStyle, options.lineWidth)]);
        if (options.labelsVisible) {
            context.context.font = `${options.fontSize}px ${context.theme.fontFamily}`;
            context.context.textAlign = 'right';
            context.context.textBaseline = 'bottom';
            context.context.fillStyle = options.color;
        }
        for (const level of levels) {
            context.context.beginPath();
            context.context.moveTo(left, level.y);
            context.context.lineTo(right, level.y);
            context.context.stroke();
            if (options.labelsVisible) {
                context.context.fillText(
                    `${formatRatio(level.ratio)} ${concisePrice(level.price)}`,
                    right - 4,
                    level.y - 2,
                );
            }
        }
        context.context.setLineDash([]);
    },
    hitTest(point: Readonly<DrawingScreenPoint>, context: DrawingPrimitiveGeometryContext) {
        const geometry = fibonacciGeometry(context);
        if (geometry === null) return null;
        const tolerance = Math.max(6, geometry.options.lineWidth / 2 + 4);
        if (point.x < geometry.left - tolerance || point.x > geometry.right + tolerance) return null;
        const minY = Math.min(...geometry.levels.map(level => level.y));
        const maxY = Math.max(...geometry.levels.map(level => level.y));
        if (point.y >= minY && point.y <= maxY) return { cursor: 'move' };
        return geometry.levels.some(level => Math.abs(point.y - level.y) <= tolerance)
            ? { cursor: 'move' }
            : null;
    },
    handleColor(instance: DrawingInstance): string {
        return (instance.options as FibonacciDrawingOptions).color;
    },
});

function measureVisual(): DrawingPrimitiveVisual {
    let labelBounds: PrimitiveRect | null = null;
    return Object.freeze({
        draw(context: DrawingPrimitiveDrawContext): void {
            if (context.points.length < 2) { labelBounds = null; return; }
            const first = context.points[0];
            const second = context.points[1];
            const options = context.instance.options as MeasureDrawingOptions;
            const bounds = pointBounds(first, second);
            context.context.fillStyle = options.fillColor;
            context.context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            context.context.strokeStyle = options.color;
            context.context.lineWidth = options.lineWidth;
            context.context.setLineDash([options.lineWidth * 4, options.lineWidth * 3]);
            context.context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            context.context.beginPath();
            context.context.moveTo(first.x, first.y);
            context.context.lineTo(second.x, second.y);
            context.context.stroke();
            context.context.setLineDash([]);

            const text = measureText(context.instance);
            context.context.font = `${options.fontSize}px ${context.theme.fontFamily}`;
            context.context.textAlign = 'left';
            context.context.textBaseline = 'middle';
            const paddingX = 7;
            const width = context.context.measureText(text).width + paddingX * 2;
            const height = options.fontSize * 1.7;
            labelBounds = fitRect({
                x: (first.x + second.x - width) / 2,
                y: (first.y + second.y - height) / 2,
                width,
                height,
            }, context.plot);
            context.context.fillStyle = options.labelBackgroundColor;
            context.context.fillRect(
                labelBounds.x,
                labelBounds.y,
                labelBounds.width,
                labelBounds.height,
            );
            context.context.fillStyle = options.labelColor;
            context.context.fillText(
                text,
                labelBounds.x + paddingX,
                labelBounds.y + labelBounds.height / 2,
            );
        },
        hitTest(point: Readonly<DrawingScreenPoint>, context: DrawingPrimitiveGeometryContext) {
            if (context.points.length < 2) return null;
            if (labelBounds !== null && contains(labelBounds, point)) return { cursor: 'move' };
            const bounds = pointBounds(context.points[0], context.points[1]);
            if (contains(bounds, point)) return { cursor: 'move' };
            const options = context.instance.options as MeasureDrawingOptions;
            return pointSegmentDistance(point, context.points[0], context.points[1])
                <= Math.max(6, options.lineWidth / 2 + 4)
                ? { cursor: 'move' }
                : null;
        },
        handleColor(instance: DrawingInstance): string {
            return (instance.options as MeasureDrawingOptions).color;
        },
    });
}

function fibonacciGeometry(context: DrawingPrimitiveGeometryContext): {
    readonly levels: readonly FibonacciLevel[];
    readonly left: number;
    readonly right: number;
    readonly options: FibonacciDrawingOptions;
} | null {
    if (context.points.length < 2 || context.instance.points.length < 2) return null;
    const options = context.instance.options as FibonacciDrawingOptions;
    const firstPrice = context.instance.points[0].price;
    const delta = context.instance.points[1].price - firstPrice;
    const levels: FibonacciLevel[] = [];
    for (const ratio of options.levels) {
        const price = firstPrice + delta * ratio;
        const y = context.priceToCoordinate(price);
        if (y !== null && Number.isFinite(y)) levels.push(Object.freeze({ ratio, price, y }));
    }
    if (levels.length === 0) return null;
    const left = clamp(Math.min(context.points[0].x, context.points[1].x), context.plot.x,
        context.plot.x + context.plot.width);
    const anchorRight = Math.max(context.points[0].x, context.points[1].x);
    const right = options.extendRight
        ? context.plot.x + context.plot.width
        : clamp(anchorRight, context.plot.x, context.plot.x + context.plot.width);
    return Object.freeze({ levels: Object.freeze(levels), left, right, options });
}

function normalizeFibonacciOptions(options: FibonacciDrawingOptions): FibonacciDrawingOptions {
    if (!Array.isArray(options.levels) || options.levels.length < 2 || options.levels.length > 32)
        throw new RangeError('sschart: fibonacci levels must contain 2..32 values');
    const levels = [...new Set(options.levels.map((level) => {
        if (typeof level !== 'number' || !Number.isFinite(level) || level < -5 || level > 5)
            throw new RangeError('sschart: fibonacci level must be finite and in the [-5, 5] range');
        return level;
    }))].sort((left, right) => left - right);
    if (levels.length < 2)
        throw new RangeError('sschart: fibonacci levels must contain at least two distinct values');
    return Object.freeze({
        color: text(options.color, 'color'),
        lineWidth: dimension(options.lineWidth, 'lineWidth', 0, 20, false),
        lineStyle: style(options.lineStyle),
        fillColor: text(options.fillColor, 'fillColor'),
        levels: Object.freeze(levels),
        labelsVisible: boolean(options.labelsVisible, 'labelsVisible'),
        fontSize: dimension(options.fontSize, 'fontSize', 8, 48, true),
        extendRight: boolean(options.extendRight, 'extendRight'),
    });
}

function normalizeMeasureOptions(options: MeasureDrawingOptions): MeasureDrawingOptions {
    return Object.freeze({
        color: text(options.color, 'color'),
        lineWidth: dimension(options.lineWidth, 'lineWidth', 0, 20, false),
        fillColor: text(options.fillColor, 'fillColor'),
        labelColor: text(options.labelColor, 'labelColor'),
        labelBackgroundColor: text(options.labelBackgroundColor, 'labelBackgroundColor'),
        fontSize: dimension(options.fontSize, 'fontSize', 8, 48, true),
    });
}

function measureText(instance: DrawingInstance): string {
    const first = instance.points[0];
    const second = instance.points[1];
    const delta = second.price - first.price;
    const percent = first.price === 0 ? null : delta / Math.abs(first.price) * 100;
    const sign = delta > 0 ? '+' : '';
    const percentText = percent === null ? 'n/a' : `${percent > 0 ? '+' : ''}${percent.toFixed(2)}%`;
    return `${sign}${concisePrice(delta)} (${percentText}) · ${duration(second.time - first.time)}`;
}

function duration(seconds: number): string {
    const sign = seconds < 0 ? '-' : '';
    let remaining = Math.abs(seconds);
    if (remaining >= 86_400) return `${sign}${concisePrice(remaining / 86_400)}d`;
    if (remaining >= 3_600) return `${sign}${concisePrice(remaining / 3_600)}h`;
    if (remaining >= 60) return `${sign}${concisePrice(remaining / 60)}m`;
    return `${sign}${concisePrice(remaining)}s`;
}

function formatRatio(value: number): string {
    return `${Number((value * 100).toFixed(3))}%`;
}

function pointBounds(first: DrawingScreenPoint, second: DrawingScreenPoint): PrimitiveRect {
    return {
        x: Math.min(first.x, second.x),
        y: Math.min(first.y, second.y),
        width: Math.abs(second.x - first.x),
        height: Math.abs(second.y - first.y),
    };
}

function fitRect(rect: PrimitiveRect, plot: PrimitiveRect): PrimitiveRect {
    const width = Math.min(rect.width, plot.width);
    const height = Math.min(rect.height, plot.height);
    return Object.freeze({
        x: clamp(rect.x, plot.x, plot.x + plot.width - width),
        y: clamp(rect.y, plot.y, plot.y + plot.height - height),
        width,
        height,
    });
}

function contains(rect: PrimitiveRect, point: Readonly<DrawingScreenPoint>): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.width
        && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function text(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: analysis drawing ${name} must be a non-empty string`);
    return value.trim();
}

function boolean(value: unknown, name: string): boolean {
    if (typeof value !== 'boolean')
        throw new TypeError(`sschart: analysis drawing ${name} must be boolean`);
    return value;
}

function dimension(
    value: unknown,
    name: string,
    minimum: number,
    maximum: number,
    includeMinimum: boolean,
): number {
    if (typeof value !== 'number' || !Number.isFinite(value)
        || (includeMinimum ? value < minimum : value <= minimum) || value > maximum) {
        throw new RangeError(`sschart: analysis drawing ${name} is out of range`);
    }
    return value;
}

function style(value: unknown): LineStyleValue {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 4)
        throw new RangeError('sschart: analysis drawing lineStyle is invalid');
    return value as LineStyleValue;
}
