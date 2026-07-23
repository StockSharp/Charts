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
import { concisePrice } from '../primitives/drawing-utils.js';

export interface PositionDrawingOptions extends DrawingOptions {
    readonly entryColor: string;
    readonly targetColor: string;
    readonly stopColor: string;
    readonly targetFillColor: string;
    readonly stopFillColor: string;
    readonly textColor: string;
    readonly lineWidth: number;
    readonly fontSize: number;
    readonly quantity: number;
}

type PositionDirection = 1 | -1;

const positionDefaults: PositionDrawingOptions = Object.freeze({
    entryColor: '#787b86',
    targetColor: '#26a69a',
    stopColor: '#ef5350',
    targetFillColor: 'rgba(38,166,154,0.18)',
    stopFillColor: 'rgba(239,83,80,0.18)',
    textColor: '#ffffff',
    lineWidth: 1,
    fontSize: 11,
    quantity: 1,
});

const longPositionDefinition = positionDefinition(
    BuiltInDrawingType.LongPosition,
    'Long Position',
    1,
);
const shortPositionDefinition = positionDefinition(
    BuiltInDrawingType.ShortPosition,
    'Short Position',
    -1,
);

export const builtInPositionDrawingDefinitions = Object.freeze([
    longPositionDefinition,
    shortPositionDefinition,
] as const);

export function registerBuiltInPositionDrawings(registry: DrawingDefinitionRegistry): void {
    registry.register(longPositionDefinition);
    registry.register(shortPositionDefinition);
}

function positionDefinition(
    type: typeof BuiltInDrawingType.LongPosition | typeof BuiltInDrawingType.ShortPosition,
    name: string,
    direction: PositionDirection,
): DrawingDefinition<PositionDrawingOptions> {
    return Object.freeze({
        type,
        name,
        points: Object.freeze({ min: 3, max: 3 }),
        defaultOptions: positionDefaults,
        normalizeOptions: normalizePositionOptions,
        create(
            instance: DrawingInstance<PositionDrawingOptions>,
            events: DrawingPrimitiveEvents<PositionDrawingOptions>,
        ) {
            return createInteractiveDrawingBinding(instance, events, positionVisual(direction));
        },
    });
}

function positionVisual(direction: PositionDirection): DrawingPrimitiveVisual {
    return Object.freeze({
        draw(context: DrawingPrimitiveDrawContext): void {
            const geometry = positionGeometry(context);
            if (geometry === null) return;
            const { entry, target, stop, left, right, options } = geometry;
            context.context.fillStyle = options.targetFillColor;
            context.context.fillRect(
                left,
                Math.min(entry.y, target.y),
                right - left,
                Math.abs(target.y - entry.y),
            );
            context.context.fillStyle = options.stopFillColor;
            context.context.fillRect(
                left,
                Math.min(entry.y, stop.y),
                right - left,
                Math.abs(stop.y - entry.y),
            );
            drawLevel(context, entry.y, left, right, options.entryColor, options.lineWidth);
            drawLevel(context, target.y, left, right, options.targetColor, options.lineWidth);
            drawLevel(context, stop.y, left, right, options.stopColor, options.lineWidth);

            const labels = positionLabels(context.instance, direction, options.quantity);
            context.context.font = `${options.fontSize}px ${context.theme.fontFamily}`;
            context.context.textAlign = 'left';
            context.context.textBaseline = 'bottom';
            context.context.fillStyle = options.textColor;
            const x = left + 5;
            context.context.fillText(labels.target, x, target.y - 3);
            context.context.fillText(labels.entry, x, entry.y - 3);
            context.context.fillText(labels.stop, x, stop.y - 3);
        },
        hitTest(point: Readonly<DrawingScreenPoint>, context: DrawingPrimitiveGeometryContext) {
            const geometry = positionGeometry(context);
            if (geometry === null) return null;
            const tolerance = Math.max(6, geometry.options.lineWidth / 2 + 4);
            if (point.x < geometry.left - tolerance || point.x > geometry.right + tolerance)
                return null;
            const minimum = Math.min(geometry.target.y, geometry.entry.y, geometry.stop.y);
            const maximum = Math.max(geometry.target.y, geometry.entry.y, geometry.stop.y);
            return point.y >= minimum - tolerance && point.y <= maximum + tolerance
                ? { cursor: 'move' }
                : null;
        },
        handleColor(instance: DrawingInstance): string {
            return (instance.options as PositionDrawingOptions).entryColor;
        },
    });
}

function positionGeometry(context: DrawingPrimitiveGeometryContext): {
    readonly entry: DrawingScreenPoint;
    readonly target: DrawingScreenPoint;
    readonly stop: DrawingScreenPoint;
    readonly left: number;
    readonly right: number;
    readonly options: PositionDrawingOptions;
} | null {
    if (context.points.length < 3) return null;
    const entry = context.points[0];
    const target = context.points[1];
    const stop = context.points[2];
    const plotRight = context.plot.x + context.plot.width;
    const left = Math.min(plotRight,
        Math.max(context.plot.x, Math.min(entry.x, target.x, stop.x)));
    const rawRight = Math.min(
        plotRight,
        Math.max(context.plot.x, Math.max(entry.x, target.x, stop.x)),
    );
    const right = rawRight - left >= 24
        ? rawRight
        : Math.min(plotRight, left + 80);
    return Object.freeze({
        entry,
        target,
        stop,
        left,
        right,
        options: context.instance.options as PositionDrawingOptions,
    });
}

function drawLevel(
    context: DrawingPrimitiveDrawContext,
    y: number,
    left: number,
    right: number,
    color: string,
    lineWidth: number,
): void {
    context.context.strokeStyle = color;
    context.context.lineWidth = lineWidth;
    context.context.setLineDash([]);
    context.context.beginPath();
    context.context.moveTo(left, y);
    context.context.lineTo(right, y);
    context.context.stroke();
}

function positionLabels(
    instance: DrawingInstance,
    direction: PositionDirection,
    quantity: number,
): { readonly entry: string; readonly target: string; readonly stop: string } {
    const entry = instance.points[0].price;
    const target = instance.points[1].price;
    const stop = instance.points[2].price;
    const reward = direction * (target - entry) * quantity;
    const risk = direction * (entry - stop) * quantity;
    const rewardPercent = entry === 0 ? null : direction * (target - entry) / Math.abs(entry) * 100;
    const riskPercent = entry === 0 ? null : direction * (entry - stop) / Math.abs(entry) * 100;
    const ratio = risk > 0 ? reward / risk : null;
    return Object.freeze({
        target: `Target ${concisePrice(target)}  ${signed(reward)} (${percent(rewardPercent)})`,
        entry: `Entry ${concisePrice(entry)}  Qty ${concisePrice(quantity)}`
            + `  R:R ${ratio === null || !Number.isFinite(ratio) ? 'n/a' : ratio.toFixed(2)}`,
        stop: `Stop ${concisePrice(stop)}  ${signed(-risk)}`
            + ` (${percent(riskPercent === null ? null : -riskPercent)})`,
    });
}

function signed(value: number): string {
    return `${value > 0 ? '+' : value < 0 ? '-' : ''}${concisePrice(Math.abs(value))}`;
}

function percent(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return 'n/a';
    return `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}%`;
}

function normalizePositionOptions(options: PositionDrawingOptions): PositionDrawingOptions {
    return Object.freeze({
        entryColor: text(options.entryColor, 'entryColor'),
        targetColor: text(options.targetColor, 'targetColor'),
        stopColor: text(options.stopColor, 'stopColor'),
        targetFillColor: text(options.targetFillColor, 'targetFillColor'),
        stopFillColor: text(options.stopFillColor, 'stopFillColor'),
        textColor: text(options.textColor, 'textColor'),
        lineWidth: dimension(options.lineWidth, 'lineWidth', 0, 20, false),
        fontSize: dimension(options.fontSize, 'fontSize', 8, 48, true),
        quantity: dimension(options.quantity, 'quantity', 0, Number.MAX_VALUE, false),
    });
}

function text(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: position drawing ${name} must be a non-empty string`);
    return value.trim();
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
        throw new RangeError(`sschart: position drawing ${name} is out of range`);
    }
    return value;
}
