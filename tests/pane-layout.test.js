const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { PaneLayout } = require('../src/core/layout/pane-layout.js');

function panes() {
    return [
        { id: 'main', height: 300, minHeight: 100, order: 0, state: 'normal' },
        { id: 'rsi', height: 150, minHeight: 50, order: 2, state: 'normal' },
        { id: 'volume', height: 100, minHeight: 40, order: 1, state: 'normal' },
    ];
}

describe('PaneLayout', () => {
    it('lays panes out by order and creates stable splitter hit zones', () => {
        const engine = new PaneLayout(6);
        const result = engine.compute(800, 600, panes());

        assert.deepEqual(result.panes.map((pane) => pane.paneId), ['main', 'volume', 'rsi']);
        assert.equal(result.splitters.length, 2);
        assert.equal(result.panes.reduce((sum, pane) => sum + pane.height, 0) + 12, 600);
        assert.equal(
            engine.hitTestSplitter(result, { x: 400, y: result.splitters[0].rect.y + 2 }),
            result.splitters[0],
        );
    });

    it('honours minimized and maximized pane state', () => {
        const engine = new PaneLayout();
        const items = panes();
        items[1].state = 'minimized';
        let result = engine.compute(800, 600, items);
        assert.equal(result.panes.find((pane) => pane.paneId === 'rsi').height, items[1].minHeight);

        items[2].state = 'maximized';
        result = engine.compute(800, 600, items);
        assert.deepEqual(result.panes, [{
            paneId: 'volume', state: 'maximized', x: 0, y: 0, width: 800, height: 600,
        }]);
        assert.deepEqual(result.splitters, []);
    });

    it('resizes adjacent panes without crossing either minimum', () => {
        const engine = new PaneLayout(5);
        const items = panes().slice(0, 2);
        const result = engine.compute(800, 500, items);
        const splitter = result.splitters[0];

        engine.resizePair(items, splitter, 500);
        assert.equal(items[1].height, items[1].minHeight);
        assert.equal(items[0].height + items[1].height, 450);
    });
});
