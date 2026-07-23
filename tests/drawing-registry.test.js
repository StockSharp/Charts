const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    DrawingDefinitionRegistry,
    normalizeDrawingInstance,
} = require('../src/drawings/index.js');

function primitive() {
    return { attached() {}, detached() {}, updateAllViews() {} };
}

describe('drawing model and registry', () => {
    it('owns a deeply immutable JSON-safe drawing instance', () => {
        const source = {
            id: ' trend-1 ',
            type: ' trend ',
            paneId: ' main ',
            points: [{ time: 10, price: 100 }, { time: 20, price: 110 }],
            options: { color: '#2962ff', labels: ['A', 'B'], nested: { opacity: 0.5 } },
            visible: true,
            locked: false,
            zOrder: 3,
        };
        const drawing = normalizeDrawingInstance(source);
        source.points[0].price = 999;
        source.options.labels[0] = 'changed';

        assert.equal(drawing.id, 'trend-1');
        assert.equal(drawing.type, 'trend');
        assert.equal(drawing.paneId, 'main');
        assert.equal(drawing.points[0].price, 100);
        assert.deepEqual(drawing.options.labels, ['A', 'B']);
        assert.equal(Object.isFrozen(drawing), true);
        assert.equal(Object.isFrozen(drawing.points), true);
        assert.equal(Object.isFrozen(drawing.options.nested), true);
        assert.deepEqual(JSON.parse(JSON.stringify(drawing)), drawing);
    });

    it('rejects values that cannot round-trip through JSON', () => {
        const base = {
            id: 'x', type: 'trend', paneId: 'main', points: [],
            options: {}, visible: true, locked: false, zOrder: 0,
        };
        assert.throws(
            () => normalizeDrawingInstance({ ...base, options: { value: Infinity } }),
            /finite/,
        );
        assert.throws(
            () => normalizeDrawingInstance({ ...base, options: { callback() {} } }),
            /JSON-safe/,
        );
        const cyclic = {};
        cyclic.self = cyclic;
        assert.throws(
            () => normalizeDrawingInstance({ ...base, options: cyclic }),
            /cycle/,
        );
    });

    it('registers typed primitive factories and rejects ambiguous definitions', () => {
        const registry = new DrawingDefinitionRegistry();
        const registered = registry.register({
            type: 'trend',
            name: 'Trend Line',
            points: { min: 2, max: 2 },
            defaultOptions: { color: '#2962ff' },
            create() { return { primitive: primitive(), update() {} }; },
        });

        assert.equal(registry.get('trend'), registered);
        assert.deepEqual(registry.types(), ['trend']);
        assert.equal(Object.isFrozen(registered.defaultOptions), true);
        assert.throws(() => registry.register({ ...registered }), /already registered/);
        assert.throws(
            () => new DrawingDefinitionRegistry().register({
                ...registered, type: 'bad', points: { min: 0, max: 2 },
            }),
            /1 <= min <= max/,
        );
        assert.equal(registry.unregister('trend'), true);
        assert.equal(registry.get('trend'), undefined);
    });
});
