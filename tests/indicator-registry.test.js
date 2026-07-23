const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    CandlestickIndicatorInput,
    IndicatorCategory,
    IndicatorInputKind,
    IndicatorMeasure,
    IndicatorPane,
    IndicatorParameterType,
    IndicatorRegistry,
    IndicatorSeriesStyle,
    IndicatorTaxonomy,
    indicatorCategoryLabel,
} = require('../src/indicators/index.js');
const rawCatalog = require('../src/chart/indicators/catalog.json');

function processor() {
    return {
        position: 0,
        reset() {},
        process(input) {
            return {
                sourceIndex: input.index,
                isFormed: true,
                values: [{ outputId: 'line', value: 1, targetIndex: input.index }],
            };
        },
        checkpoint() { return {}; },
        restore() {},
    };
}

function definition(overrides = {}) {
    return {
        id: 'ExampleAverage',
        name: 'Example Average',
        description: 'Incremental example used by the registry contract.',
        category: IndicatorCategory.Trend,
        input: CandlestickIndicatorInput,
        parameters: [{
            id: 'length',
            name: 'Length',
            type: IndicatorParameterType.Integer,
            defaultValue: 20,
            min: 2,
            max: 500,
            step: 1,
        }],
        outputs: [{
            id: 'line',
            name: 'Average',
            defaultStyle: {
                series: IndicatorSeriesStyle.Line,
                color: '#ffd700',
                lineWidth: 2,
                options: { priceLineVisible: false },
            },
        }],
        naturalPane: IndicatorPane.Overlay,
        measure: IndicatorMeasure.Price,
        processorFactory: () => processor(),
        ...overrides,
    };
}

describe('IndicatorRegistry', () => {
    it('classifies the complete trading catalog without an Other bucket', () => {
        assert.equal(rawCatalog.length, 162);
        assert.equal(rawCatalog.some(entry => entry.group === 'Other'), false);
        assert.equal(new Set(IndicatorTaxonomy.map(entry => entry.category)).size,
            IndicatorTaxonomy.length);
        for (const entry of IndicatorTaxonomy)
            assert.equal(indicatorCategoryLabel(entry.category), entry.label);
    });

    it('owns immutable typed definitions and resolves ids case-insensitively', () => {
        const registry = new IndicatorRegistry();
        const source = definition();
        const registered = registry.register(source);

        assert.notEqual(registered, source);
        assert.equal(registry.get('exampleaverage'), registered);
        assert.equal(registry.get('EXAMPLEAVERAGE'), registered);
        assert.equal(registry.has('ExampleAverage'), true);
        assert.deepEqual(registry.all(), [registered]);
        assert.equal(Object.isFrozen(registry.all()), true);
        assert.equal(Object.isFrozen(registered), true);
        assert.equal(Object.isFrozen(registered.input), true);
        assert.equal(Object.isFrozen(registered.input.fields), true);
        assert.equal(Object.isFrozen(registered.parameters), true);
        assert.equal(Object.isFrozen(registered.parameters[0]), true);
        assert.equal(Object.isFrozen(registered.outputs[0].defaultStyle.options), true);

        source.parameters[0].defaultValue = 5;
        source.outputs[0].defaultStyle.color = '#000000';
        assert.equal(registered.parameters[0].defaultValue, 20);
        assert.equal(registered.outputs[0].defaultStyle.color, '#ffd700');
        assert.equal(registry.unregister('EXAMPLEAVERAGE'), true);
        assert.equal(registry.has('ExampleAverage'), false);
    });

    it('rejects duplicate ids and incomplete executable metadata', () => {
        const registry = new IndicatorRegistry();
        registry.register(definition());

        assert.throws(() => registry.register(definition({ id: 'exampleaverage' })), /already registered/);
        assert.throws(() => registry.register(definition({ id: ' Bad ' })), /whitespace/);
        assert.throws(() => registry.register(definition({ category: 'Other' })), /category/);
        assert.throws(() => registry.register(definition({ processorFactory: null })), /processorFactory/);
        assert.throws(() => registry.register(definition({ outputs: [] })), /outputs must not be empty/);
        assert.throws(() => registry.register(definition({
            input: { kind: IndicatorInputKind.Scalar, fields: [] },
        })), /input.fields must not be empty/);
    });

    it('validates parameter, output and input schemas before registration', () => {
        const registry = new IndicatorRegistry();

        assert.throws(() => registry.register(definition({
            parameters: [{
                id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
                defaultValue: 2.5,
            }],
        })), /must be an integer/);
        assert.throws(() => registry.register(definition({
            parameters: [{
                id: 'length', name: 'Length', type: IndicatorParameterType.Integer,
                defaultValue: 20, min: 30,
            }],
        })), /outside its bounds/);
        assert.throws(() => registry.register(definition({
            outputs: [{ id: 'line', name: 'Line', defaultStyle: { series: 'spline' } }],
        })), /series is invalid/);
        assert.throws(() => registry.register(definition({
            input: {
                kind: IndicatorInputKind.Scalar,
                fields: [
                    { id: 'value', type: 'number', required: true },
                    { id: 'VALUE', type: 'number', required: true },
                ],
            },
        })), /duplicate indicator input field/);
    });

    it('normalizes and freezes parameter-dependent output definitions', () => {
        const registry = new IndicatorRegistry();
        const output = (id) => ({
            id,
            name: id.toUpperCase(),
            defaultStyle: { series: IndicatorSeriesStyle.Line },
        });
        const registered = registry.register(definition({
            outputs: [output('line'), output('signal')],
            outputFactory: ({ length }) => (
                length >= 10 ? [output('line'), output('signal')] : [output('line')]
            ),
        }));

        const resolved = registered.outputFactory({ length: 5 });
        assert.deepEqual(resolved.map((item) => item.id), ['line']);
        assert.equal(Object.isFrozen(resolved), true);
        assert.equal(Object.isFrozen(resolved[0]), true);
        assert.throws(() => registry.register(definition({
            outputFactory: null,
        })), /outputFactory/);
        assert.throws(() => registry.register(definition({
            outputFactory: () => [],
        })), /resolved outputs must not be empty/);
        assert.throws(() => registry.register(definition({
            outputFactory: () => [output('other')],
        })), /default outputs must match/);
    });
});
