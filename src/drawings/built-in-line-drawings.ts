import type { LineStyleValue } from '../core/chart-api.js';
import { lineDash, pointSegmentDistance } from '../primitives/drawing-utils.js';
import type { DrawingInstance, DrawingOptions } from './drawing-model.js';
import {
    DrawingDefinitionRegistry,
    type DrawingDefinition,
    type DrawingPrimitiveEvents,
} from './drawing-registry.js';
import {
    createInteractiveDrawingBinding,
    type DrawingPrimitiveDrawContext,
    type DrawingPrimitiveGeometryContext,
    type DrawingPrimitiveVisual,
    type DrawingScreenPoint,
} from './interactive-drawing-primitive.js';

export const BuiltInDrawingType = Object.freeze({
    HorizontalLine: 'horizontal-line',
    VerticalLine: 'vertical-line',
    TrendLine: 'trend-line',
    Ray: 'ray',
    Rectangle: 'rectangle',
    Text: 'text',
    Note: 'note',
    FibonacciRetracement: 'fibonacci-retracement',
    Measure: 'measure',
    LongPosition: 'long-position',
    ShortPosition: 'short-position',
} as const);
export type BuiltInDrawingType = typeof BuiltInDrawingType[keyof typeof BuiltInDrawingType];

export interface LineDrawingOptions extends DrawingOptions {
    readonly color: string;
    readonly lineWidth: number;
    readonly lineStyle: LineStyleValue;
}

interface Segment {
    readonly start: DrawingScreenPoint;
    readonly end: DrawingScreenPoint;
}

type SegmentResolver = (context: DrawingPrimitiveGeometryContext) => Segment | null;

const horizontalVisual = lineVisual(({ points, plot }) => {
    const anchor = points[0];
    return anchor === undefined ? null : {
        start: { x: plot.x, y: anchor.y },
        end: { x: plot.x + plot.width, y: anchor.y },
    };
});

const verticalVisual = lineVisual(({ points, plot }) => {
    const anchor = points[0];
    return anchor === undefined ? null : {
        start: { x: anchor.x, y: plot.y },
        end: { x: anchor.x, y: plot.y + plot.height },
    };
});

const trendVisual = lineVisual(({ points, plot }) => points.length < 2
    ? null
    : clipParametric(points[0], points[1], plot, 0, 1));

const rayVisual = lineVisual(({ points, plot }) => points.length < 2
    ? null
    : clipParametric(points[0], points[1], plot, 0, Number.POSITIVE_INFINITY));

const defaults: LineDrawingOptions = Object.freeze({
    color: '#2962ff',
    lineWidth: 2,
    lineStyle: 0,
});

export const builtInLineDrawingDefinitions: readonly DrawingDefinition<LineDrawingOptions>[] =
    Object.freeze([
        definition(BuiltInDrawingType.HorizontalLine, 'Horizontal Line', 1, horizontalVisual),
        definition(BuiltInDrawingType.VerticalLine, 'Vertical Line', 1, verticalVisual),
        definition(BuiltInDrawingType.TrendLine, 'Trend Line', 2, trendVisual),
        definition(BuiltInDrawingType.Ray, 'Ray', 2, rayVisual),
    ]);

export function registerBuiltInLineDrawings(registry: DrawingDefinitionRegistry): void {
    for (const definition of builtInLineDrawingDefinitions) registry.register(definition);
}

function definition(
    type: typeof BuiltInDrawingType.HorizontalLine
        | typeof BuiltInDrawingType.VerticalLine
        | typeof BuiltInDrawingType.TrendLine
        | typeof BuiltInDrawingType.Ray,
    name: string,
    pointCount: number,
    visual: DrawingPrimitiveVisual,
): DrawingDefinition<LineDrawingOptions> {
    return Object.freeze({
        type,
        name,
        points: Object.freeze({ min: pointCount, max: pointCount }),
        defaultOptions: defaults,
        normalizeOptions: normalizeLineOptions,
        create(
            instance: DrawingInstance<LineDrawingOptions>,
            events: DrawingPrimitiveEvents<LineDrawingOptions>,
        ) {
            return createInteractiveDrawingBinding(instance, events, visual);
        },
    });
}

function normalizeLineOptions(options: LineDrawingOptions): LineDrawingOptions {
    const color = options.color;
    if (typeof color !== 'string' || color.trim().length === 0)
        throw new TypeError('sschart: line drawing color must be a non-empty string');
    const lineWidth = options.lineWidth;
    if (!Number.isFinite(lineWidth) || lineWidth <= 0 || lineWidth > 20)
        throw new RangeError('sschart: line drawing lineWidth must be in the (0, 20] range');
    const lineStyle = options.lineStyle;
    if (!Number.isInteger(lineStyle) || lineStyle < 0 || lineStyle > 4)
        throw new RangeError('sschart: line drawing lineStyle is invalid');
    return Object.freeze({ color: color.trim(), lineWidth, lineStyle });
}

function lineVisual(resolve: SegmentResolver): DrawingPrimitiveVisual {
    return Object.freeze({
        draw(context: DrawingPrimitiveDrawContext) {
            const segment = resolve(context);
            if (segment === null) return;
            const options = context.instance.options as LineDrawingOptions;
            context.context.strokeStyle = options.color;
            context.context.lineWidth = options.lineWidth;
            context.context.setLineDash([...lineDash(options.lineStyle, options.lineWidth)]);
            context.context.beginPath();
            context.context.moveTo(segment.start.x, segment.start.y);
            context.context.lineTo(segment.end.x, segment.end.y);
            context.context.stroke();
            context.context.setLineDash([]);
        },
        hitTest(
            point: Readonly<DrawingScreenPoint>,
            context: DrawingPrimitiveGeometryContext,
        ) {
            const segment = resolve(context);
            if (segment === null) return null;
            const options = context.instance.options as LineDrawingOptions;
            const tolerance = Math.max(6, options.lineWidth / 2 + 4);
            return pointSegmentDistance(point, segment.start, segment.end) <= tolerance
                ? { cursor: 'move' }
                : null;
        },
        handleColor(instance: DrawingInstance) {
            return (instance.options as LineDrawingOptions).color;
        },
    });
}

/** Liang-Barsky clipping for a segment or ray expressed by its t interval. */
function clipParametric(
    start: DrawingScreenPoint,
    end: DrawingScreenPoint,
    plot: Readonly<{ x: number; y: number; width: number; height: number }>,
    minimum: number,
    maximum: number,
): Segment | null {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) return contains(plot, start) ? { start, end } : null;
    let from = minimum;
    let to = maximum;
    const constrain = (origin: number, delta: number, low: number, high: number): boolean => {
        if (delta === 0) return origin >= low && origin <= high;
        const first = (low - origin) / delta;
        const second = (high - origin) / delta;
        from = Math.max(from, Math.min(first, second));
        to = Math.min(to, Math.max(first, second));
        return from <= to;
    };
    if (!constrain(start.x, dx, plot.x, plot.x + plot.width)
        || !constrain(start.y, dy, plot.y, plot.y + plot.height)) return null;
    return Object.freeze({
        start: Object.freeze({ x: start.x + dx * from, y: start.y + dy * from }),
        end: Object.freeze({ x: start.x + dx * to, y: start.y + dy * to }),
    });
}

function contains(
    plot: Readonly<{ x: number; y: number; width: number; height: number }>,
    point: DrawingScreenPoint,
): boolean {
    return point.x >= plot.x && point.x <= plot.x + plot.width
        && point.y >= plot.y && point.y <= plot.y + plot.height;
}
