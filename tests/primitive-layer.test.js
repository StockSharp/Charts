const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { PrimitiveZOrder } = require('../src/core/primitives/primitive-api.js');
const {
    primitiveLayerOrder,
    primitiveLayerRank,
    sortPrimitiveLayers,
} = require('../src/core/primitives/primitive-layer.js');

describe('primitive z-order layers', () => {
    it('exposes one immutable closed layer order', () => {
        assert.equal(Object.isFrozen(PrimitiveZOrder), true);
        assert.deepEqual(primitiveLayerOrder, ['background', 'bottom', 'normal', 'top']);
        assert.deepEqual(
            primitiveLayerOrder.map((value) => primitiveLayerRank(value)),
            [0, 1, 2, 3],
        );
        assert.throws(() => primitiveLayerRank('custom-layer'), /unsupported primitive z-order/);
    });

    it('sorts by layer and preserves attachment order inside each layer', () => {
        const values = [
            { id: 'normal-a', layer: PrimitiveZOrder.Normal },
            { id: 'top', layer: PrimitiveZOrder.Top },
            { id: 'background', layer: PrimitiveZOrder.Background },
            { id: 'normal-b', layer: PrimitiveZOrder.Normal },
            { id: 'bottom', layer: PrimitiveZOrder.Bottom },
        ];

        assert.deepEqual(
            sortPrimitiveLayers(values, (value) => value.layer).map((value) => value.id),
            ['background', 'bottom', 'normal-a', 'normal-b', 'top'],
        );
    });
});
