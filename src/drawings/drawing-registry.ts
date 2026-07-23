import type { IChartPrimitive } from '../core/chart-api.js';
import {
    normalizeDrawingOptions,
    type DrawingInstance,
    type DrawingOptions,
} from './drawing-model.js';

export interface DrawingPointSchema {
    readonly min: number;
    readonly max: number;
}

export interface DrawingPrimitiveEvents<TOptions extends DrawingOptions = DrawingOptions> {
    /** Live gesture state; the controller does not add it to command history. */
    preview(instance: DrawingInstance<TOptions>): void;
    /** Final gesture state; the controller records one undoable command. */
    commit(instance: DrawingInstance<TOptions>): void;
    /** Cancels the current gesture and restores its pre-gesture model. */
    cancel(instance: DrawingInstance<TOptions>): void;
}

export interface DrawingPrimitiveBinding<TOptions extends DrawingOptions = DrawingOptions> {
    readonly primitive: IChartPrimitive;
    update(instance: DrawingInstance<TOptions>): void;
    dispose?(): void;
}

export interface DrawingDefinition<TOptions extends DrawingOptions = DrawingOptions> {
    readonly type: string;
    readonly name: string;
    readonly points: DrawingPointSchema;
    readonly defaultOptions: TOptions;
    /** Validates and canonicalizes JSON-safe options before they enter the model. */
    readonly normalizeOptions?: (options: TOptions) => TOptions;
    create(
        instance: DrawingInstance<TOptions>,
        events: DrawingPrimitiveEvents<TOptions>,
    ): DrawingPrimitiveBinding<TOptions>;
}

/** Extensible drawing type catalog. Unknown persisted types are resolved as undefined. */
export class DrawingDefinitionRegistry {
    private readonly definitions = new Map<string, DrawingDefinition>();

    register<TOptions extends DrawingOptions>(
        definition: DrawingDefinition<TOptions>,
    ): DrawingDefinition<TOptions> {
        if (definition === null || typeof definition !== 'object')
            throw new TypeError('sschart: drawing definition must be an object');
        const type = text(definition.type, 'type');
        const name = text(definition.name, 'name');
        const points = pointSchema(definition.points);
        if (typeof definition.create !== 'function')
            throw new TypeError(`sschart: drawing type '${type}' must provide create()`);
        if (definition.normalizeOptions !== undefined
            && typeof definition.normalizeOptions !== 'function') {
            throw new TypeError(`sschart: drawing type '${type}' normalizeOptions must be a function`);
        }
        if (this.definitions.has(type))
            throw new Error(`sschart: drawing type '${type}' is already registered`);
        const rawDefaults = normalizeDrawingOptions(definition.defaultOptions) as TOptions;
        const defaultOptions = normalizeDrawingOptions(
            definition.normalizeOptions?.(rawDefaults) ?? rawDefaults,
        ) as TOptions;
        const normalized = Object.freeze({
            type,
            name,
            points,
            defaultOptions,
            normalizeOptions: definition.normalizeOptions,
            create: definition.create,
        });
        this.definitions.set(type, normalized as DrawingDefinition);
        return normalized;
    }

    unregister(type: string): boolean { return this.definitions.delete(type); }
    has(type: string): boolean { return this.definitions.has(type); }
    get(type: string): DrawingDefinition | undefined { return this.definitions.get(type); }
    types(): readonly string[] { return Object.freeze([...this.definitions.keys()]); }
}

export const drawingDefinitionRegistry = new DrawingDefinitionRegistry();

export function registerDrawing<TOptions extends DrawingOptions>(
    definition: DrawingDefinition<TOptions>,
): DrawingDefinition<TOptions> {
    return drawingDefinitionRegistry.register(definition);
}

export function unregisterDrawing(type: string): boolean {
    return drawingDefinitionRegistry.unregister(type);
}

export function getDrawingDefinition(type: string): DrawingDefinition | undefined {
    return drawingDefinitionRegistry.get(type);
}

export function getDrawingTypes(): readonly string[] {
    return drawingDefinitionRegistry.types();
}

function pointSchema(value: DrawingPointSchema): DrawingPointSchema {
    if (value === null || typeof value !== 'object'
        || !Number.isInteger(value.min) || value.min < 1
        || !Number.isInteger(value.max) || value.max < value.min) {
        throw new RangeError('sschart: drawing point schema requires integers 1 <= min <= max');
    }
    return Object.freeze({ min: value.min, max: value.max });
}

function text(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: drawing definition ${name} must be a non-empty string`);
    if (value !== value.trim())
        throw new Error(`sschart: drawing definition ${name} cannot contain outer whitespace`);
    return value;
}
