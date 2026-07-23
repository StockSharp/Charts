const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { SeriesRendererRegistry } = require('../src/series/registry.js');

describe('SeriesRendererRegistry', () => {
    it('registers, resolves and unregisters custom renderer definitions', () => {
        const registry = new SeriesRendererRegistry();
        const definition = {
            type: 'Range',
            defaultOptions: {},
            renderer: { draw() {} },
        };

        assert.equal(registry.register(definition), definition);
        assert.equal(registry.register(definition), definition);
        assert.equal(registry.resolve({ type: 'Range' }), definition);
        assert.deepEqual(registry.types(), ['Range']);
        assert.ok(Object.isFrozen(definition));
        assert.equal(registry.unregister('Range'), true);
        assert.equal(registry.has('Range'), false);
        assert.throws(() => registry.resolve({ type: 'Range' }), /unknown series type/);
    });

    it('rejects ambiguous and invalid registrations', () => {
        const registry = new SeriesRendererRegistry();
        registry.register({ type: 'Range', defaultOptions: {}, renderer: { draw() {} } });

        assert.throws(
            () => registry.register({ type: 'Range', defaultOptions: {}, renderer: { draw() {} } }),
            /already registered/,
        );
        assert.throws(() => registry.register({ type: '  ', defaultOptions: {}, renderer: { draw() {} } }), /cannot be empty/);
        assert.throws(() => registry.register({ type: ' Range ', defaultOptions: {}, renderer: { draw() {} } }), /whitespace/);
        assert.throws(() => registry.register({ type: 'Broken', defaultOptions: {}, renderer: {} }), /renderer\.draw/);
        assert.throws(() => registry.register({ type: 'NoDefaults', renderer: { draw() {} } }), /defaultOptions/);
    });
});
