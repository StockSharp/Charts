const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { HitTestEngine } = require('../src/core/interaction/hit-test.js');
const {
    PrimitiveHitTestRole,
    PrimitiveZOrder,
} = require('../src/core/primitives/primitive-api.js');

const primitive = (name) => ({ name, attached() {}, detached() {}, updateAllViews() {} });
const candidate = (name, attachmentOrder, zOrder, hit) => ({
    primitive: primitive(name),
    attachmentOrder,
    zOrder,
    test: () => hit,
});

describe('HitTestEngine', () => {
    it('resolves hits in reverse layer then reverse attachment order', () => {
        const engine = new HitTestEngine();
        const top = candidate('top', 0, PrimitiveZOrder.Top, {
            id: 'top', role: PrimitiveHitTestRole.Body, cursor: 'grab',
        });
        const laterNormal = candidate('normal-later', 2, PrimitiveZOrder.Normal, {
            id: 'normal-later', role: PrimitiveHitTestRole.Handle,
        });
        const earlierNormal = candidate('normal-earlier', 1, PrimitiveZOrder.Normal, {
            id: 'normal-earlier', role: PrimitiveHitTestRole.Handle,
        });

        const layered = engine.hitTest([laterNormal, top, earlierNormal]);
        assert.equal(layered.id, 'top');
        assert.equal(layered.cursor, 'grab');
        assert.equal(Object.isFrozen(layered), true);

        const sameLayer = engine.hitTest([earlierNormal, laterNormal]);
        assert.equal(sameLayer.id, 'normal-later');
        assert.equal(sameLayer.cursor, 'pointer');
    });

    it('allows a hit to identify its exact rendered layer', () => {
        const engine = new HitTestEngine();
        const result = engine.hitTest([
            candidate('first', 0, PrimitiveZOrder.Normal, {
                id: 'background-part',
                role: PrimitiveHitTestRole.Label,
                zOrder: PrimitiveZOrder.Background,
            }),
            candidate('second', 1, PrimitiveZOrder.Bottom, {
                id: 'bottom', role: PrimitiveHitTestRole.Body,
            }),
        ]);
        assert.equal(result.id, 'bottom');
        assert.equal(result.cursor, 'move');
    });

    it('ignores malformed and failing third-party hit providers', () => {
        const engine = new HitTestEngine();
        const invalid = [
            candidate('empty-id', 0, PrimitiveZOrder.Top, {
                id: '', role: PrimitiveHitTestRole.Body,
            }),
            candidate('bad-role', 1, PrimitiveZOrder.Top, {
                id: 'bad', role: 'unknown',
            }),
            candidate('bad-layer', 2, PrimitiveZOrder.Top, {
                id: 'bad-layer', role: PrimitiveHitTestRole.Body, zOrder: 'floating',
            }),
            {
                primitive: primitive('throws'),
                attachmentOrder: 3,
                zOrder: PrimitiveZOrder.Top,
                test: () => { throw new Error('broken plugin'); },
            },
        ];
        assert.equal(engine.hitTest(invalid), null);
    });
});
