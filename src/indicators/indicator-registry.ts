import {
    IndicatorCategory,
    IndicatorInputFieldType,
    IndicatorInputKind,
    IndicatorMeasure,
    IndicatorPane,
    IndicatorParameterType,
    IndicatorSeriesStyle,
    type IndicatorDefinition,
    type IndicatorInputField,
    type IndicatorInputSchema,
    type IndicatorOutputDefinition,
    type IndicatorOutputStyle,
    type IndicatorParameterDefinition,
    type IndicatorParameterValue,
    type IndicatorParameters,
} from './indicator-definition.js';

const CATEGORIES = new Set(Object.values(IndicatorCategory));
const INPUT_KINDS = new Set(Object.values(IndicatorInputKind));
const INPUT_FIELD_TYPES = new Set(Object.values(IndicatorInputFieldType));
const PARAMETER_TYPES = new Set(Object.values(IndicatorParameterType));
const SERIES_STYLES = new Set(Object.values(IndicatorSeriesStyle));
const PANES = new Set(Object.values(IndicatorPane));
const MEASURES = new Set(Object.values(IndicatorMeasure));

function text(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: indicator ${name} must be a non-empty string`);
    if (value !== value.trim())
        throw new TypeError(`sschart: indicator ${name} cannot contain leading or trailing whitespace`);
    return value;
}

function finite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new TypeError(`sschart: indicator ${name} must be finite`);
    return value;
}

function immutableRecord(
    value: Readonly<Record<string, string | number | boolean>> | undefined,
    name: string,
): Readonly<Record<string, string | number | boolean>> | undefined {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError(`sschart: indicator ${name} must be an object`);
    const result: Record<string, string | number | boolean> = {};
    for (const [key, item] of Object.entries(value)) {
        text(key, `${name} key`);
        if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean')
            throw new TypeError(`sschart: indicator ${name}.${key} has an unsupported value`);
        if (typeof item === 'number') finite(item, `${name}.${key}`);
        result[key] = item;
    }
    return Object.freeze(result);
}

function normalizeInputField(value: IndicatorInputField, index: number): IndicatorInputField {
    const name = `input.fields[${index}]`;
    if (value === null || typeof value !== 'object')
        throw new TypeError(`sschart: indicator ${name} must be an object`);
    if (!INPUT_FIELD_TYPES.has(value.type))
        throw new TypeError(`sschart: indicator ${name}.type is invalid`);
    if (typeof value.required !== 'boolean')
        throw new TypeError(`sschart: indicator ${name}.required must be boolean`);
    return Object.freeze({ id: text(value.id, `${name}.id`), type: value.type, required: value.required });
}

function normalizeInput(value: IndicatorInputSchema): IndicatorInputSchema {
    if (value === null || typeof value !== 'object')
        throw new TypeError('sschart: indicator input must be an object');
    if (!INPUT_KINDS.has(value.kind))
        throw new TypeError('sschart: indicator input.kind is invalid');
    if (!Array.isArray(value.fields) || value.fields.length === 0)
        throw new TypeError('sschart: indicator input.fields must not be empty');
    const fields = value.fields.map(normalizeInputField);
    assertUnique(fields, 'input field');
    return Object.freeze({ kind: value.kind, fields: Object.freeze(fields) });
}

function assertParameterDefault(
    type: IndicatorParameterDefinition['type'],
    value: IndicatorParameterValue,
    name: string,
): void {
    if (type === IndicatorParameterType.Boolean) {
        if (typeof value !== 'boolean')
            throw new TypeError(`sschart: indicator ${name} must be boolean`);
        return;
    }
    if (type === IndicatorParameterType.String) {
        if (typeof value !== 'string')
            throw new TypeError(`sschart: indicator ${name} must be a string`);
        return;
    }
    finite(value, name);
    if (type === IndicatorParameterType.Integer && !Number.isInteger(value))
        throw new TypeError(`sschart: indicator ${name} must be an integer`);
}

function normalizeParameter(
    value: IndicatorParameterDefinition,
    index: number,
): IndicatorParameterDefinition {
    const name = `parameters[${index}]`;
    if (value === null || typeof value !== 'object')
        throw new TypeError(`sschart: indicator ${name} must be an object`);
    if (!PARAMETER_TYPES.has(value.type))
        throw new TypeError(`sschart: indicator ${name}.type is invalid`);
    assertParameterDefault(value.type, value.defaultValue, `${name}.defaultValue`);

    const min = value.min === undefined ? undefined : finite(value.min, `${name}.min`);
    const max = value.max === undefined ? undefined : finite(value.max, `${name}.max`);
    const step = value.step === undefined ? undefined : finite(value.step, `${name}.step`);
    if (min !== undefined && max !== undefined && min > max)
        throw new RangeError(`sschart: indicator ${name}.min cannot exceed max`);
    if (step !== undefined && step <= 0)
        throw new RangeError(`sschart: indicator ${name}.step must be positive`);
    if ((min !== undefined || max !== undefined || step !== undefined)
        && value.type !== IndicatorParameterType.Number
        && value.type !== IndicatorParameterType.Integer) {
        throw new TypeError(`sschart: indicator ${name} numeric bounds require a numeric type`);
    }
    if (typeof value.defaultValue === 'number'
        && ((min !== undefined && value.defaultValue < min)
            || (max !== undefined && value.defaultValue > max))) {
        throw new RangeError(`sschart: indicator ${name}.defaultValue is outside its bounds`);
    }

    let options: readonly string[] | undefined;
    if (value.options !== undefined) {
        if (value.type !== IndicatorParameterType.String)
            throw new TypeError(`sschart: indicator ${name}.options require a string type`);
        if (!Array.isArray(value.options) || value.options.length === 0)
            throw new TypeError(`sschart: indicator ${name}.options must not be empty`);
        const normalized = value.options.map((option, optionIndex) => (
            text(option, `${name}.options[${optionIndex}]`)
        ));
        if (new Set(normalized).size !== normalized.length)
            throw new TypeError(`sschart: indicator ${name}.options contains duplicates`);
        if (!normalized.includes(value.defaultValue as string))
            throw new RangeError(`sschart: indicator ${name}.defaultValue is not in options`);
        options = Object.freeze(normalized);
    }

    return Object.freeze({
        id: text(value.id, `${name}.id`),
        name: text(value.name, `${name}.name`),
        ...(value.description === undefined
            ? {}
            : { description: text(value.description, `${name}.description`) }),
        type: value.type,
        defaultValue: value.defaultValue,
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
        ...(step === undefined ? {} : { step }),
        ...(options === undefined ? {} : { options }),
    });
}

function normalizeStyle(value: IndicatorOutputStyle, name: string): IndicatorOutputStyle {
    if (value === null || typeof value !== 'object')
        throw new TypeError(`sschart: indicator ${name} must be an object`);
    if (!SERIES_STYLES.has(value.series))
        throw new TypeError(`sschart: indicator ${name}.series is invalid`);
    const color = value.color === undefined ? undefined : text(value.color, `${name}.color`);
    const lineWidth = value.lineWidth === undefined
        ? undefined
        : finite(value.lineWidth, `${name}.lineWidth`);
    if (lineWidth !== undefined && lineWidth <= 0)
        throw new RangeError(`sschart: indicator ${name}.lineWidth must be positive`);
    if (value.visible !== undefined && typeof value.visible !== 'boolean')
        throw new TypeError(`sschart: indicator ${name}.visible must be boolean`);
    const options = immutableRecord(value.options, `${name}.options`);
    return Object.freeze({
        series: value.series,
        ...(color === undefined ? {} : { color }),
        ...(lineWidth === undefined ? {} : { lineWidth }),
        ...(value.visible === undefined ? {} : { visible: value.visible }),
        ...(options === undefined ? {} : { options }),
    });
}

function normalizeOutput(
    value: IndicatorOutputDefinition,
    index: number,
    source = 'outputs',
): IndicatorOutputDefinition {
    const name = `${source}[${index}]`;
    if (value === null || typeof value !== 'object')
        throw new TypeError(`sschart: indicator ${name} must be an object`);
    return Object.freeze({
        id: text(value.id, `${name}.id`),
        name: text(value.name, `${name}.name`),
        ...(value.description === undefined
            ? {}
            : { description: text(value.description, `${name}.description`) }),
        defaultStyle: normalizeStyle(value.defaultStyle, `${name}.defaultStyle`),
    });
}

function normalizeOutputs(
    value: readonly IndicatorOutputDefinition[],
    source = 'outputs',
): readonly IndicatorOutputDefinition[] {
    if (!Array.isArray(value) || value.length === 0)
        throw new TypeError(`sschart: indicator ${source} must not be empty`);
    const outputs = value.map((output, index) => normalizeOutput(output, index, source));
    assertUnique(outputs, 'output');
    return Object.freeze(outputs);
}

function assertUnique(values: readonly { readonly id: string }[], name: string): void {
    const ids = new Set<string>();
    for (const value of values) {
        const key = value.id.toLowerCase();
        if (ids.has(key)) throw new TypeError(`sschart: duplicate indicator ${name} '${value.id}'`);
        ids.add(key);
    }
}

function normalizeDefinition<TInput, TParameters extends IndicatorParameters>(
    value: IndicatorDefinition<TInput, TParameters>,
): IndicatorDefinition<TInput, TParameters> {
    if (value === null || typeof value !== 'object')
        throw new TypeError('sschart: indicator definition must be an object');
    if (!CATEGORIES.has(value.category))
        throw new TypeError('sschart: indicator category is invalid');
    if (!PANES.has(value.naturalPane))
        throw new TypeError('sschart: indicator naturalPane is invalid');
    if (!MEASURES.has(value.measure))
        throw new TypeError('sschart: indicator measure is invalid');
    if (typeof value.processorFactory !== 'function')
        throw new TypeError('sschart: indicator processorFactory must be a function');
    if (!Array.isArray(value.parameters))
        throw new TypeError('sschart: indicator parameters must be an array');
    if (value.outputFactory !== undefined && typeof value.outputFactory !== 'function')
        throw new TypeError('sschart: indicator outputFactory must be a function');

    const parameters = value.parameters.map(normalizeParameter);
    const outputs = normalizeOutputs(value.outputs);
    assertUnique(parameters, 'parameter');
    const outputFactory = value.outputFactory === undefined
        ? undefined
        : (factoryParameters: TParameters) => normalizeOutputs(
            value.outputFactory!(factoryParameters),
            'resolved outputs',
        );
    if (outputFactory !== undefined) {
        const defaults = Object.fromEntries(parameters.map((parameter) => (
            [parameter.id, parameter.defaultValue]
        ))) as TParameters;
        const defaultOutputs = outputFactory(defaults);
        if (defaultOutputs.length !== outputs.length
            || defaultOutputs.some((output, index) => output.id !== outputs[index].id)) {
            throw new TypeError(
                'sschart: indicator default outputs must match outputFactory defaults',
            );
        }
    }
    return Object.freeze({
        id: text(value.id, 'definition id'),
        name: text(value.name, 'definition name'),
        description: text(value.description, 'definition description'),
        category: value.category,
        input: normalizeInput(value.input),
        parameters: Object.freeze(parameters),
        outputs,
        ...(outputFactory === undefined ? {} : { outputFactory }),
        naturalPane: value.naturalPane,
        measure: value.measure,
        processorFactory: value.processorFactory,
    });
}

function definitionKey(id: string): string {
    return text(id, 'definition id').toLowerCase();
}

/** Registry for definitions backed by real incremental processors. */
export class IndicatorRegistry {
    private readonly definitions = new Map<string, IndicatorDefinition<any, any>>();

    register<TInput, TParameters extends IndicatorParameters>(
        definition: IndicatorDefinition<TInput, TParameters>,
    ): IndicatorDefinition<TInput, TParameters> {
        const normalized = normalizeDefinition(definition);
        const key = definitionKey(normalized.id);
        const existing = this.definitions.get(key);
        if (existing !== undefined) {
            if (existing === definition) return existing as IndicatorDefinition<TInput, TParameters>;
            throw new Error(`sschart: indicator '${normalized.id}' is already registered`);
        }
        this.definitions.set(key, normalized);
        return normalized;
    }

    unregister(id: string): boolean { return this.definitions.delete(definitionKey(id)); }
    has(id: string): boolean { return this.definitions.has(definitionKey(id)); }
    get(id: string): IndicatorDefinition<any, any> | undefined {
        return this.definitions.get(definitionKey(id));
    }
    all(): readonly IndicatorDefinition<any, any>[] {
        return Object.freeze(Array.from(this.definitions.values()));
    }
}

export const indicatorRegistry = new IndicatorRegistry();

export function registerIndicator<TInput, TParameters extends IndicatorParameters>(
    definition: IndicatorDefinition<TInput, TParameters>,
): IndicatorDefinition<TInput, TParameters> {
    return indicatorRegistry.register(definition);
}

export function unregisterIndicator(id: string): boolean {
    return indicatorRegistry.unregister(id);
}

export function getIndicatorDefinition(id: string): IndicatorDefinition<any, any> | undefined {
    return indicatorRegistry.get(id);
}

export function getIndicatorDefinitions(): readonly IndicatorDefinition<any, any>[] {
    return indicatorRegistry.all();
}
