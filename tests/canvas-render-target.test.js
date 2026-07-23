const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CanvasRenderTarget2D } = require('../src/core/render/canvas-render-target.js');

function fakeContext(events) {
    return {
        save() { events.push('save'); },
        restore() { events.push('restore'); },
        setTransform(...values) { events.push(['transform', ...values]); },
    };
}

describe('CanvasRenderTarget2D', () => {
    it('provides immutable media and bitmap scopes', () => {
        const events = [];
        const pane = {
            x: 0, y: 10, width: 600, height: 280,
            plot: { x: 40, y: 18, width: 500, height: 250 },
            isLast: true,
        };
        const target = new CanvasRenderTarget2D(fakeContext(events), 600, 300, 2, pane);

        target.useMediaCoordinateSpace((scope) => {
            assert.deepEqual(scope.mediaSize, { width: 600, height: 300 });
            assert.equal(Object.isFrozen(scope), true);
        });
        target.useBitmapCoordinateSpace((scope) => {
            assert.deepEqual(scope.bitmapSize, { width: 1200, height: 600 });
            assert.equal(scope.horizontalPixelRatio, 2);
            assert.equal(scope.verticalPixelRatio, 2);
        });

        assert.deepEqual(events, [
            'save', ['transform', 2, 0, 0, 2, 0, 0], 'restore',
            'save', ['transform', 1, 0, 0, 1, 0, 0], 'restore',
        ]);
        assert.equal(Object.isFrozen(target.pane), true);
        assert.equal(Object.isFrozen(target.pane.plot), true);
    });

    it('restores canvas state when a renderer scope throws', () => {
        const events = [];
        const target = new CanvasRenderTarget2D(fakeContext(events), 10, 10, 1, {
            x: 0, y: 0, width: 10, height: 10,
            plot: { x: 0, y: 0, width: 10, height: 10 },
            isLast: true,
        });

        assert.throws(() => target.useMediaCoordinateSpace(() => {
            throw new Error('renderer failed');
        }), /renderer failed/);
        assert.equal(events.at(-1), 'restore');
    });
});
