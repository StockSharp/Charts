const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    INDICATOR_TEMPLATE_SCHEMA_VERSION,
    IndicatorTemplateController,
    deserializeIndicatorTemplates,
    serializeIndicatorTemplates,
} = require('../src/workspace/templates.js');

function indicator(overrides = {}) {
    return Object.freeze({
        id: 'indicator-1',
        type: 'BollingerBands',
        name: 'Bollinger Bands',
        description: '',
        input: null,
        parameterDefinitions: [],
        parameters: Object.freeze({ length: 20, stdDev: 2 }),
        source: Object.freeze({
            kind: 'indicator-output',
            indicatorId: 'indicator-0',
            outputId: 'line',
        }),
        sourceStatus: Object.freeze({
            source: Object.freeze({ kind: 'candles' }),
            available: true,
            reason: 'ready',
        }),
        paneId: null,
        priceScaleId: null,
        effectivePriceScaleId: 'right',
        visible: true,
        outputs: Object.freeze([
            Object.freeze({
                id: 'upper',
                name: 'Upper',
                style: Object.freeze({ color: '#123456', visible: true }),
            }),
            Object.freeze({
                id: 'lower',
                name: 'Lower',
                style: Object.freeze({
                    color: '#654321', lineWidth: 2, lineStyle: 2,
                    visible: false, precision: 4,
                }),
            }),
        ]),
        ...overrides,
    });
}

function fakeIndicators(initial = indicator()) {
    let current = initial;
    const patches = [];
    return {
        patches,
        get: id => id === current.id ? current : undefined,
        update: (id, patch) => {
            assert.equal(id, current.id);
            patches.push(patch);
            current = Object.freeze({
                ...current,
                parameters: Object.freeze({ ...current.parameters, ...(patch.parameters || {}) }),
                source: patch.source || current.source,
                visible: patch.visible ?? current.visible,
            });
            return current;
        },
    };
}

function storedTemplate(id = 'stored-template') {
    return {
        schemaVersion: INDICATOR_TEMPLATE_SCHEMA_VERSION,
        id,
        name: 'Stored',
        indicatorType: 'BollingerBands',
        parameters: { length: 10, stdDev: 1 },
        source: { kind: 'candle-field', field: 'hlc3' },
        visible: true,
        outputs: {
            upper: {
                color: '#abcdef', lineWidth: null, lineStyle: null,
                visible: true, precision: null,
            },
        },
    };
}

describe('IndicatorTemplateController', () => {
    it('captures portable, exact output state and applies it through one controller update', async () => {
        const indicators = fakeIndicators();
        const templates = new IndicatorTemplateController({
            indicators,
            createId: () => 'template-1',
        });

        const template = await templates.create('My bands', 'indicator-1');
        assert.equal(template.source, null);
        assert.deepEqual(template.outputs.upper, {
            color: '#123456',
            lineWidth: null,
            lineStyle: null,
            visible: true,
            precision: null,
        });
        assert.ok(Object.isFrozen(template.parameters));
        assert.ok(Object.isFrozen(template.outputs));

        const serialized = serializeIndicatorTemplates(templates.document(), { pretty: true });
        assert.deepEqual(deserializeIndicatorTemplates(serialized), templates.document());
        templates.apply(template.id, 'indicator-1');
        assert.deepEqual(indicators.patches.at(-1), {
            parameters: { length: 20, stdDev: 2 },
            visible: true,
            outputs: {
                upper: {
                    color: '#123456', lineWidth: null, lineStyle: null,
                    visible: true, precision: null,
                },
                lower: {
                    color: '#654321', lineWidth: 2, lineStyle: 2,
                    visible: false, precision: 4,
                },
            },
        });
        assert.equal(Object.hasOwn(indicators.patches.at(-1), 'source'), false);
    });

    it('merges edits made during async load and persists a versioned document', async () => {
        let finishLoad;
        const saves = [];
        const storage = {
            load: () => new Promise(resolve => { finishLoad = resolve; }),
            save: value => { saves.push(value); },
        };
        const templates = new IndicatorTemplateController({
            indicators: fakeIndicators(indicator({ source: { kind: 'candles' } })),
            storage,
            createId: () => 'new-template',
        });

        const loading = templates.load();
        const creating = templates.create('New', 'indicator-1');
        finishLoad(serializeIndicatorTemplates({
            schemaVersion: INDICATOR_TEMPLATE_SCHEMA_VERSION,
            templates: [storedTemplate()],
        }));
        await loading;
        await creating;

        assert.deepEqual(templates.templates().map(template => template.id), [
            'stored-template',
            'new-template',
        ]);
        const saved = deserializeIndicatorTemplates(saves.at(-1));
        assert.equal(saved.schemaVersion, INDICATOR_TEMPLATE_SCHEMA_VERSION);
        assert.deepEqual(saved.templates.map(template => template.id), [
            'stored-template',
            'new-template',
        ]);

        assert.equal(await templates.remove('stored-template'), true);
        assert.deepEqual(templates.templates().map(template => template.id), ['new-template']);
    });

    it('rejects schema drift, runtime sources and type-mismatched application', async () => {
        assert.throws(() => deserializeIndicatorTemplates({
            schemaVersion: 2,
            templates: [],
        }), /unsupported indicator template schema version/);
        assert.throws(() => deserializeIndicatorTemplates({
            schemaVersion: 1,
            templates: [{
                ...storedTemplate(),
                source: { kind: 'indicator-output', indicatorId: 'one', outputId: 'line' },
            }],
        }), /cannot be templated/);
        assert.throws(() => deserializeIndicatorTemplates({
            schemaVersion: 1,
            templates: [{
                ...storedTemplate(),
                parameters: JSON.parse('{"__proto__":20}'),
            }],
        }), /parameter id '__proto__' is reserved/);

        const indicators = fakeIndicators();
        const templates = new IndicatorTemplateController({
            indicators,
            createId: () => 'template-1',
        });
        await templates.create('Bands', 'indicator-1');
        const other = indicator({ id: 'indicator-2', type: 'RelativeStrengthIndex' });
        indicators.get = id => id === other.id ? other : undefined;
        assert.throws(
            () => templates.apply('template-1', 'indicator-2'),
            /is for 'BollingerBands', not 'RelativeStrengthIndex'/,
        );
    });
});
