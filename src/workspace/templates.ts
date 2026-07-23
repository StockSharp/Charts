import type { LineStyleValue } from '../core/chart-api.js';
import {
    IndicatorSourceKind,
    normalizeIndicatorOutputStylePatch,
    normalizeIndicatorSource,
    type IndicatorCandleFieldSource,
    type IndicatorCandlesSource,
    type IndicatorOutputStylePatch,
    type IndicatorParameterValue,
} from '../indicators/index.js';
import type {
    IndicatorControllerSnapshot,
    IndicatorUpdatePatch,
} from './indicator-controller.js';

export const INDICATOR_TEMPLATE_SCHEMA_VERSION = 1 as const;

export type IndicatorTemplateSource = IndicatorCandlesSource | IndicatorCandleFieldSource;

export interface IndicatorTemplateOutputStyle {
    readonly color?: string;
    readonly lineWidth: number | null;
    readonly lineStyle: LineStyleValue | null;
    readonly visible: boolean;
    readonly precision: number | null;
}

export interface IndicatorTemplateV1 {
    readonly schemaVersion: typeof INDICATOR_TEMPLATE_SCHEMA_VERSION;
    readonly id: string;
    readonly name: string;
    readonly indicatorType: string;
    readonly parameters: Readonly<Record<string, IndicatorParameterValue>>;
    /** Null means a runtime indicator-output source was intentionally not captured. */
    readonly source: IndicatorTemplateSource | null;
    readonly visible: boolean;
    readonly outputs: Readonly<Record<string, IndicatorTemplateOutputStyle>>;
}

export interface IndicatorTemplateDocumentV1 {
    readonly schemaVersion: typeof INDICATOR_TEMPLATE_SCHEMA_VERSION;
    readonly templates: readonly IndicatorTemplateV1[];
}

export interface IndicatorTemplateStorage {
    load(): string | null | Promise<string | null>;
    save(serialized: string): void | Promise<void>;
}

export interface IndicatorTemplateIndicatorController {
    get(indicatorId: string): IndicatorControllerSnapshot | undefined;
    update(indicatorId: string, patch: IndicatorUpdatePatch): IndicatorControllerSnapshot;
}

export interface IndicatorTemplateControllerOptions {
    readonly indicators: IndicatorTemplateIndicatorController;
    readonly storage?: IndicatorTemplateStorage;
    readonly createId?: () => string;
    readonly pretty?: boolean;
}

export interface IndicatorTemplateControllerSnapshot {
    readonly document: IndicatorTemplateDocumentV1;
    readonly loaded: boolean;
}

export type IndicatorTemplateListener = (snapshot: IndicatorTemplateControllerSnapshot) => void;

export interface SerializeIndicatorTemplatesOptions {
    readonly pretty?: boolean;
}

/** Validates and serializes the versioned, portable indicator-template document. */
export function serializeIndicatorTemplates(
    value: IndicatorTemplateDocumentV1,
    options: SerializeIndicatorTemplatesOptions = {},
): string {
    if (!plainObject(options) || (options.pretty !== undefined && typeof options.pretty !== 'boolean'))
        throw new TypeError('sschart: indicator template serialization options are invalid');
    return JSON.stringify(
        normalizeIndicatorTemplateDocument(value),
        null,
        options.pretty === true ? 2 : undefined,
    );
}

/** Parses and validates a versioned indicator-template document. */
export function deserializeIndicatorTemplates(value: string | unknown): IndicatorTemplateDocumentV1 {
    let parsed = value;
    if (typeof value === 'string') {
        try { parsed = JSON.parse(value); }
        catch (error) {
            throw new SyntaxError(
                `sschart: invalid indicator template JSON: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }
    return normalizeIndicatorTemplateDocument(parsed);
}

export function normalizeIndicatorTemplateDocument(value: unknown): IndicatorTemplateDocumentV1 {
    const document = record(value, 'indicator template document');
    exactKeys(document, ['schemaVersion', 'templates'], 'indicator template document');
    if (document.schemaVersion !== INDICATOR_TEMPLATE_SCHEMA_VERSION) {
        throw new RangeError(
            `sschart: unsupported indicator template schema version '${String(document.schemaVersion)}'`,
        );
    }
    if (!Array.isArray(document.templates))
        throw new TypeError('sschart: indicator template document templates must be an array');
    const ids = new Set<string>();
    const templates = Object.freeze(document.templates.map((template, index) => {
        const normalized = normalizeTemplate(template, index);
        if (ids.has(normalized.id))
            throw new TypeError(`sschart: duplicate indicator template id '${normalized.id}'`);
        ids.add(normalized.id);
        return normalized;
    }));
    return Object.freeze({ schemaVersion: INDICATOR_TEMPLATE_SCHEMA_VERSION, templates });
}

/** CRUD, persistence and undoable application of portable indicator templates. */
export class IndicatorTemplateController {
    private readonly indicators: IndicatorTemplateIndicatorController;
    private readonly storage?: IndicatorTemplateStorage;
    private readonly createIdValue: () => string;
    private readonly pretty: boolean;
    private readonly values = new Map<string, IndicatorTemplateV1>();
    private readonly listeners = new Set<IndicatorTemplateListener>();
    private loadPromise: Promise<IndicatorTemplateDocumentV1> | null = null;
    private saveTail: Promise<void> = Promise.resolve();
    private loadingMutations: Map<string, IndicatorTemplateV1 | null> | null = null;
    private loaded: boolean;

    constructor(options: IndicatorTemplateControllerOptions) {
        if (!plainObject(options) || !validIndicatorController(options.indicators))
            throw new TypeError('sschart: indicator template controller options are invalid');
        if (options.storage !== undefined && !validStorage(options.storage))
            throw new TypeError('sschart: indicator template storage is invalid');
        if (options.createId !== undefined && typeof options.createId !== 'function')
            throw new TypeError('sschart: indicator template createId must be a function');
        if (options.pretty !== undefined && typeof options.pretty !== 'boolean')
            throw new TypeError('sschart: indicator template pretty option must be boolean');
        this.indicators = options.indicators;
        this.storage = options.storage;
        this.createIdValue = options.createId ?? defaultTemplateId;
        this.pretty = options.pretty === true;
        this.loaded = options.storage === undefined;
    }

    templates(indicatorType?: string): readonly IndicatorTemplateV1[] {
        const type = indicatorType === undefined
            ? undefined : identifier(indicatorType, 'indicator template type');
        return Object.freeze([...this.values.values()].filter(template => (
            type === undefined || template.indicatorType === type
        )));
    }

    get(templateId: string): IndicatorTemplateV1 | undefined {
        return this.values.get(identifier(templateId, 'indicator template id'));
    }

    document(): IndicatorTemplateDocumentV1 {
        return Object.freeze({
            schemaVersion: INDICATOR_TEMPLATE_SCHEMA_VERSION,
            templates: this.templates(),
        });
    }

    snapshot(): IndicatorTemplateControllerSnapshot {
        return Object.freeze({ document: this.document(), loaded: this.loaded });
    }

    subscribe(listener: IndicatorTemplateListener): void {
        if (typeof listener !== 'function')
            throw new TypeError('sschart: indicator template listener must be a function');
        this.listeners.add(listener);
    }

    unsubscribe(listener: IndicatorTemplateListener): void {
        this.listeners.delete(listener);
    }

    load(): Promise<IndicatorTemplateDocumentV1> {
        if (!this.storage) return Promise.resolve(this.document());
        if (this.loadPromise) return this.loadPromise;
        this.loadingMutations = new Map<string, IndicatorTemplateV1 | null>(this.values);
        let stored: string | null | Promise<string | null>;
        try { stored = this.storage.load(); }
        catch (error) {
            this.loadingMutations = null;
            return Promise.reject(error);
        }
        this.loadPromise = Promise.resolve(stored).then((serialized) => {
            const loaded = serialized === null
                ? emptyDocument()
                : deserializeIndicatorTemplates(serialized);
            const merged = new Map(loaded.templates.map(template => [template.id, template]));
            for (const [id, template] of this.loadingMutations ?? []) {
                if (template === null) merged.delete(id);
                else merged.set(id, template);
            }
            this.loadingMutations = null;
            this.values.clear();
            for (const [id, template] of merged) this.values.set(id, template);
            this.loaded = true;
            this.emit();
            return this.document();
        }).catch((error) => {
            this.loadingMutations = null;
            this.loadPromise = null;
            throw error;
        });
        return this.loadPromise;
    }

    create(name: string, indicatorId: string): Promise<IndicatorTemplateV1> {
        const snapshot = this.requireIndicator(indicatorId);
        const template = captureTemplate(this.nextId(), name, snapshot);
        return this.write(template.id, template).then(() => template);
    }

    replace(
        templateId: string,
        indicatorId: string,
        name?: string,
    ): Promise<IndicatorTemplateV1> {
        const current = this.requireTemplate(templateId);
        const snapshot = this.requireIndicator(indicatorId);
        if (snapshot.type !== current.indicatorType) {
            throw new RangeError(
                `sschart: template '${current.id}' is for '${current.indicatorType}', not '${snapshot.type}'`,
            );
        }
        const template = captureTemplate(current.id, name ?? current.name, snapshot);
        return this.write(current.id, template).then(() => template);
    }

    rename(templateId: string, name: string): Promise<IndicatorTemplateV1> {
        const current = this.requireTemplate(templateId);
        const template = Object.freeze({ ...current, name: templateName(name) });
        return this.write(current.id, template).then(() => template);
    }

    remove(templateId: string): Promise<boolean> {
        const id = identifier(templateId, 'indicator template id');
        if (!this.values.has(id)) return Promise.resolve(false);
        return this.write(id, null).then(() => true);
    }

    /** Applies calculation/source/appearance while deliberately preserving pane and scale. */
    apply(templateId: string, indicatorId: string): IndicatorControllerSnapshot {
        const template = this.requireTemplate(templateId);
        const target = this.requireIndicator(indicatorId);
        if (target.type !== template.indicatorType) {
            throw new RangeError(
                `sschart: template '${template.id}' is for '${template.indicatorType}', not '${target.type}'`,
            );
        }
        const outputs: Record<string, IndicatorOutputStylePatch> = {};
        for (const [outputId, style] of Object.entries(template.outputs)) {
            outputs[outputId] = Object.freeze({
                ...(style.color === undefined ? {} : { color: style.color }),
                lineWidth: style.lineWidth,
                lineStyle: style.lineStyle,
                visible: style.visible,
                precision: style.precision,
            });
        }
        return this.indicators.update(target.id, Object.freeze({
            parameters: template.parameters,
            ...(template.source === null ? {} : { source: template.source }),
            visible: template.visible,
            outputs: Object.freeze(outputs),
        }));
    }

    private requireIndicator(indicatorId: string): IndicatorControllerSnapshot {
        const id = identifier(indicatorId, 'indicator id');
        const snapshot = this.indicators.get(id);
        if (snapshot === undefined) throw new RangeError(`sschart: unknown indicator '${id}'`);
        return snapshot;
    }

    private requireTemplate(templateId: string): IndicatorTemplateV1 {
        const id = identifier(templateId, 'indicator template id');
        const template = this.values.get(id);
        if (template === undefined) throw new RangeError(`sschart: unknown indicator template '${id}'`);
        return template;
    }

    private nextId(): string {
        for (let attempt = 0; attempt < 100; attempt++) {
            const id = identifier(this.createIdValue(), 'generated indicator template id');
            if (!this.values.has(id)) return id;
        }
        throw new Error('sschart: indicator template id factory did not produce a unique id');
    }

    private write(id: string, template: IndicatorTemplateV1 | null): Promise<void> {
        const loadPending = this.storage !== undefined && !this.loaded;
        const loading = loadPending ? this.load() : this.loadPromise;
        if (template === null) this.values.delete(id);
        else this.values.set(id, template);
        this.loadingMutations?.set(id, template);
        this.emit();
        return this.persist(loading);
    }

    private persist(loading: Promise<IndicatorTemplateDocumentV1> | null): Promise<void> {
        if (!this.storage) return Promise.resolve();
        const waitForLoad = loading ?? Promise.resolve(this.document());
        const save = async (): Promise<void> => {
            await waitForLoad;
            await this.storage!.save(serializeIndicatorTemplates(
                this.document(),
                { pretty: this.pretty },
            ));
        };
        this.saveTail = this.saveTail.then(save, save);
        return this.saveTail;
    }

    private emit(): void {
        const snapshot = this.snapshot();
        for (const listener of this.listeners) listener(snapshot);
    }
}

function captureTemplate(
    id: string,
    name: string,
    snapshot: IndicatorControllerSnapshot,
): IndicatorTemplateV1 {
    const parameters: Record<string, IndicatorParameterValue> = {};
    for (const [key, value] of Object.entries(snapshot.parameters))
        parameters[propertyId(key, 'indicator template parameter id')] = value;
    const outputs: Record<string, IndicatorTemplateOutputStyle> = {};
    for (const output of snapshot.outputs) {
        outputs[propertyId(output.id, 'indicator template output id')] = Object.freeze({
            ...(output.style.color === undefined ? {} : { color: output.style.color }),
            lineWidth: output.style.lineWidth ?? null,
            lineStyle: output.style.lineStyle ?? null,
            visible: output.style.visible,
            precision: output.style.precision ?? null,
        });
    }
    const source = snapshot.source.kind === IndicatorSourceKind.IndicatorOutput
        ? null
        : normalizePortableSource(snapshot.source);
    return Object.freeze({
        schemaVersion: INDICATOR_TEMPLATE_SCHEMA_VERSION,
        id: identifier(id, 'indicator template id'),
        name: templateName(name),
        indicatorType: identifier(snapshot.type, 'indicator template type'),
        parameters: Object.freeze(parameters),
        source,
        visible: snapshot.visible,
        outputs: Object.freeze(outputs),
    });
}

function normalizeTemplate(value: unknown, index: number): IndicatorTemplateV1 {
    const template = record(value, `indicator template ${index}`);
    exactKeys(template, [
        'schemaVersion', 'id', 'name', 'indicatorType', 'parameters', 'source', 'visible', 'outputs',
    ], `indicator template ${index}`);
    if (template.schemaVersion !== INDICATOR_TEMPLATE_SCHEMA_VERSION)
        throw new RangeError(`sschart: indicator template ${index} has an unsupported schema version`);
    const id = identifier(template.id, `indicator template ${index} id`);
    const parameters = normalizeParameters(template.parameters, id);
    if (typeof template.visible !== 'boolean')
        throw new TypeError(`sschart: indicator template '${id}' visible must be boolean`);
    const outputs = normalizeOutputs(template.outputs, id);
    return Object.freeze({
        schemaVersion: INDICATOR_TEMPLATE_SCHEMA_VERSION,
        id,
        name: templateName(template.name),
        indicatorType: identifier(template.indicatorType, `indicator template '${id}' type`),
        parameters,
        source: template.source === null ? null : normalizePortableSource(template.source),
        visible: template.visible,
        outputs,
    });
}

function normalizeParameters(
    value: unknown,
    templateId: string,
): Readonly<Record<string, IndicatorParameterValue>> {
    const parameters = record(value, `indicator template '${templateId}' parameters`);
    const result: Record<string, IndicatorParameterValue> = {};
    for (const [rawKey, item] of Object.entries(parameters)) {
        const key = propertyId(rawKey, `indicator template '${templateId}' parameter id`);
        if (typeof item !== 'string' && typeof item !== 'boolean'
            && (typeof item !== 'number' || !Number.isFinite(item))) {
            throw new TypeError(
                `sschart: indicator template '${templateId}' parameter '${key}' is invalid`,
            );
        }
        result[key] = item as IndicatorParameterValue;
    }
    return Object.freeze(result);
}

function normalizeOutputs(
    value: unknown,
    templateId: string,
): Readonly<Record<string, IndicatorTemplateOutputStyle>> {
    const rawOutputs = record(value, `indicator template '${templateId}' outputs`);
    const outputs: Record<string, IndicatorTemplateOutputStyle> = {};
    for (const [rawId, rawStyle] of Object.entries(rawOutputs)) {
        const outputId = propertyId(rawId, `indicator template '${templateId}' output id`);
        const style = record(rawStyle, `indicator template '${templateId}' output '${outputId}'`);
        exactKeys(style, ['color', 'lineWidth', 'lineStyle', 'visible', 'precision'],
            `indicator template '${templateId}' output '${outputId}'`, ['color']);
        for (const key of ['lineWidth', 'lineStyle', 'visible', 'precision']) {
            if (!Object.prototype.hasOwnProperty.call(style, key)) {
                throw new TypeError(
                    `sschart: indicator template '${templateId}' output '${outputId}' requires '${key}'`,
                );
            }
        }
        const normalized = normalizeIndicatorOutputStylePatch(style);
        if (normalized.lineWidth === undefined || normalized.lineStyle === undefined
            || normalized.visible === undefined || normalized.precision === undefined) {
            throw new TypeError(
                `sschart: indicator template '${templateId}' output '${outputId}' has incomplete style`,
            );
        }
        outputs[outputId] = Object.freeze({
            ...(normalized.color === undefined ? {} : { color: normalized.color }),
            lineWidth: normalized.lineWidth,
            lineStyle: normalized.lineStyle,
            visible: normalized.visible,
            precision: normalized.precision,
        });
    }
    return Object.freeze(outputs);
}

function normalizePortableSource(value: unknown): IndicatorTemplateSource {
    const source = normalizeIndicatorSource(value);
    if (source.kind === IndicatorSourceKind.IndicatorOutput) {
        throw new RangeError(
            'sschart: indicator-output sources are runtime references and cannot be templated',
        );
    }
    return source;
}

function emptyDocument(): IndicatorTemplateDocumentV1 {
    return Object.freeze({
        schemaVersion: INDICATOR_TEMPLATE_SCHEMA_VERSION,
        templates: Object.freeze([]),
    });
}

let fallbackId = 0;
function defaultTemplateId(): string {
    const cryptoValue = globalThis.crypto as Crypto | undefined;
    if (typeof cryptoValue?.randomUUID === 'function')
        return `indicator-template-${cryptoValue.randomUUID()}`;
    fallbackId++;
    return `indicator-template-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}

function templateName(value: unknown): string {
    return identifier(value, 'indicator template name');
}

function identifier(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}

function propertyId(value: unknown, name: string): string {
    const id = identifier(value, name);
    if (id === '__proto__' || id === 'prototype' || id === 'constructor')
        throw new TypeError(`sschart: ${name} '${id}' is reserved`);
    return id;
}

function record(value: unknown, name: string): Readonly<Record<string, unknown>> {
    if (!plainObject(value)) throw new TypeError(`sschart: ${name} must be a plain object`);
    return value;
}

function exactKeys(
    value: Readonly<Record<string, unknown>>,
    keys: readonly string[],
    name: string,
    optional: readonly string[] = [],
): void {
    const allowed = new Set(keys);
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) throw new TypeError(`sschart: ${name} '${key}' is unsupported`);
    }
    const optionalKeys = new Set(optional);
    for (const key of keys) {
        if (!optionalKeys.has(key) && !Object.prototype.hasOwnProperty.call(value, key))
            throw new TypeError(`sschart: ${name} requires '${key}'`);
    }
}

function plainObject(value: unknown): value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function validStorage(value: unknown): value is IndicatorTemplateStorage {
    return value !== null && typeof value === 'object'
        && typeof (value as IndicatorTemplateStorage).load === 'function'
        && typeof (value as IndicatorTemplateStorage).save === 'function';
}

function validIndicatorController(value: unknown): value is IndicatorTemplateIndicatorController {
    return value !== null && typeof value === 'object'
        && typeof (value as IndicatorTemplateIndicatorController).get === 'function'
        && typeof (value as IndicatorTemplateIndicatorController).update === 'function';
}
