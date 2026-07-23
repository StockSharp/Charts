import type { LineStyleValue, PrimitiveRect } from '../core/chart-api.js';
import { lineDash } from '../primitives/drawing-utils.js';
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

export interface RectangleDrawingOptions extends DrawingOptions {
    readonly color: string;
    readonly lineWidth: number;
    readonly lineStyle: LineStyleValue;
    readonly fillColor: string;
}

export interface TextDrawingOptions extends DrawingOptions {
    readonly text: string;
    readonly color: string;
    readonly backgroundColor: string;
    readonly borderColor: string;
    readonly borderWidth: number;
    readonly fontSize: number;
    readonly fontFamily: string;
    readonly padding: number;
}

const rectangleDefaults: RectangleDrawingOptions = Object.freeze({
    color: '#2962ff',
    lineWidth: 2,
    lineStyle: 0,
    fillColor: 'rgba(41,98,255,0.12)',
});

const textDefaults: TextDrawingOptions = Object.freeze({
    text: 'Text',
    color: '#d1d4dc',
    backgroundColor: 'rgba(0,0,0,0)',
    borderColor: '#2962ff',
    borderWidth: 0,
    fontSize: 14,
    fontFamily: 'Arial, sans-serif',
    padding: 4,
});

const noteDefaults: TextDrawingOptions = Object.freeze({
    ...textDefaults,
    text: 'Note',
    backgroundColor: 'rgba(41,98,255,0.18)',
    borderWidth: 1,
    padding: 6,
});

const rectangleDefinition: DrawingDefinition<RectangleDrawingOptions> = Object.freeze({
    type: BuiltInDrawingType.Rectangle,
    name: 'Rectangle',
    points: Object.freeze({ min: 2, max: 2 }),
    defaultOptions: rectangleDefaults,
    normalizeOptions: normalizeRectangleOptions,
    create(
        instance: DrawingInstance<RectangleDrawingOptions>,
        events: DrawingPrimitiveEvents<RectangleDrawingOptions>,
    ) {
        return createInteractiveDrawingBinding(instance, events, rectangleVisual);
    },
});

const textDrawingDefinition = textDefinition(BuiltInDrawingType.Text, 'Text', textDefaults);
const noteDrawingDefinition = textDefinition(BuiltInDrawingType.Note, 'Note', noteDefaults);

export const builtInShapeDrawingDefinitions = Object.freeze([
    rectangleDefinition,
    textDrawingDefinition,
    noteDrawingDefinition,
] as const);

export function registerBuiltInShapeDrawings(registry: DrawingDefinitionRegistry): void {
    registry.register(rectangleDefinition);
    registry.register(textDrawingDefinition);
    registry.register(noteDrawingDefinition);
}

const rectangleVisual: DrawingPrimitiveVisual = Object.freeze({
    draw(context: DrawingPrimitiveDrawContext): void {
        const bounds = rectangleBounds(context.points);
        if (bounds === null) return;
        const options = context.instance.options as RectangleDrawingOptions;
        context.context.fillStyle = options.fillColor;
        context.context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        context.context.strokeStyle = options.color;
        context.context.lineWidth = options.lineWidth;
        context.context.setLineDash([...lineDash(options.lineStyle, options.lineWidth)]);
        context.context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        context.context.setLineDash([]);
    },
    hitTest(point: Readonly<DrawingScreenPoint>, context: DrawingPrimitiveGeometryContext) {
        const bounds = rectangleBounds(context.points);
        if (bounds === null) return null;
        const options = context.instance.options as RectangleDrawingOptions;
        const tolerance = Math.max(4, options.lineWidth / 2 + 2);
        return contains(expand(bounds, tolerance), point) ? { cursor: 'move' } : null;
    },
    handleColor(instance: DrawingInstance): string {
        return (instance.options as RectangleDrawingOptions).color;
    },
});

function textDefinition(
    type: typeof BuiltInDrawingType.Text | typeof BuiltInDrawingType.Note,
    name: string,
    defaultOptions: TextDrawingOptions,
): DrawingDefinition<TextDrawingOptions> {
    return Object.freeze({
        type,
        name,
        points: Object.freeze({ min: 1, max: 1 }),
        defaultOptions,
        normalizeOptions: normalizeTextOptions,
        create(
            instance: DrawingInstance<TextDrawingOptions>,
            events: DrawingPrimitiveEvents<TextDrawingOptions>,
        ) {
            return createInteractiveDrawingBinding(instance, events, textVisual());
        },
    });
}

/** Per-binding visual: measured bounds belong to one primitive and one font. */
function textVisual(): DrawingPrimitiveVisual {
    let bounds: PrimitiveRect | null = null;
    return Object.freeze({
        draw(context: DrawingPrimitiveDrawContext): void {
            const anchor = context.points[0];
            if (anchor === undefined) { bounds = null; return; }
            const options = context.instance.options as TextDrawingOptions;
            const lines = options.text.split(/\r?\n/);
            const lineHeight = options.fontSize * 1.25;
            context.context.font = `${options.fontSize}px ${options.fontFamily}`;
            context.context.textAlign = 'left';
            context.context.textBaseline = 'top';
            let contentWidth = 0;
            for (const line of lines)
                contentWidth = Math.max(contentWidth, context.context.measureText(line).width);
            bounds = Object.freeze({
                x: anchor.x,
                y: anchor.y,
                width: contentWidth + options.padding * 2,
                height: lines.length * lineHeight + options.padding * 2,
            });
            context.context.fillStyle = options.backgroundColor;
            context.context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            if (options.borderWidth > 0) {
                context.context.strokeStyle = options.borderColor;
                context.context.lineWidth = options.borderWidth;
                context.context.setLineDash([]);
                context.context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            }
            context.context.fillStyle = options.color;
            for (let index = 0; index < lines.length; index++) {
                context.context.fillText(
                    lines[index],
                    anchor.x + options.padding,
                    anchor.y + options.padding + index * lineHeight,
                );
            }
        },
        hitTest(point: Readonly<DrawingScreenPoint>): { cursor: string } | null {
            return bounds !== null && contains(bounds, point) ? { cursor: 'move' } : null;
        },
        handleColor(instance: DrawingInstance): string {
            return (instance.options as TextDrawingOptions).borderColor;
        },
    });
}

function normalizeRectangleOptions(options: RectangleDrawingOptions): RectangleDrawingOptions {
    return Object.freeze({
        color: color(options.color, 'color'),
        lineWidth: dimension(options.lineWidth, 'lineWidth', 0, 20, false),
        lineStyle: style(options.lineStyle),
        fillColor: color(options.fillColor, 'fillColor'),
    });
}

function normalizeTextOptions(options: TextDrawingOptions): TextDrawingOptions {
    if (typeof options.text !== 'string')
        throw new TypeError('sschart: text drawing text must be a string');
    if (options.text.length > 10_000)
        throw new RangeError('sschart: text drawing text is too long');
    return Object.freeze({
        text: options.text,
        color: color(options.color, 'color'),
        backgroundColor: color(options.backgroundColor, 'backgroundColor'),
        borderColor: color(options.borderColor, 'borderColor'),
        borderWidth: dimension(options.borderWidth, 'borderWidth', 0, 20, true),
        fontSize: dimension(options.fontSize, 'fontSize', 8, 96, true),
        fontFamily: color(options.fontFamily, 'fontFamily'),
        padding: dimension(options.padding, 'padding', 0, 40, true),
    });
}

function rectangleBounds(points: readonly DrawingScreenPoint[]): PrimitiveRect | null {
    if (points.length < 2) return null;
    const left = Math.min(points[0].x, points[1].x);
    const top = Math.min(points[0].y, points[1].y);
    return Object.freeze({
        x: left,
        y: top,
        width: Math.abs(points[1].x - points[0].x),
        height: Math.abs(points[1].y - points[0].y),
    });
}

function contains(rect: PrimitiveRect, point: Readonly<DrawingScreenPoint>): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.width
        && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function expand(rect: PrimitiveRect, amount: number): PrimitiveRect {
    return {
        x: rect.x - amount,
        y: rect.y - amount,
        width: rect.width + amount * 2,
        height: rect.height + amount * 2,
    };
}

function color(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: shape drawing ${name} must be a non-empty string`);
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
        throw new RangeError(
            `sschart: shape drawing ${name} must be in the `
            + `${includeMinimum ? '[' : '('}${minimum}, ${maximum}] range`,
        );
    }
    return value;
}

function style(value: unknown): LineStyleValue {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 4)
        throw new RangeError('sschart: shape drawing lineStyle is invalid');
    return value as LineStyleValue;
}
