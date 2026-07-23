const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { PrimitiveZOrder } = require('../src/core/primitives/primitive-api.js');
const { SeriesMarkersPrimitive } = require('../src/core/primitives/series-markers-primitive.js');

describe('SeriesMarkersPrimitive', () => {
    it('owns a sorted marker snapshot and invalidates only while attached', () => {
        let updates = 0;
        const primitive = new SeriesMarkersPrimitive({
            series: {},
            pointAtTime: () => null,
            priceValue: () => null,
        });
        const late = { time: 20, position: 'aboveBar', color: '#f00', shape: 'circle' };
        const early = { time: 10, position: 'belowBar', color: '#0f0', shape: 'square' };

        primitive.setMarkers([late, early]);
        assert.deepEqual(primitive.markers(), [early, late]);
        primitive.attached({ requestUpdate: () => updates++ });
        primitive.setMarkers([late]);
        assert.equal(updates, 1);
        assert.deepEqual(primitive.markers(), [late]);
        assert.equal(primitive.paneViews()[0].zOrder(), PrimitiveZOrder.Normal);

        primitive.detached();
        primitive.setMarkers([]);
        assert.equal(updates, 1);
        assert.deepEqual(primitive.markers(), []);
    });
});
