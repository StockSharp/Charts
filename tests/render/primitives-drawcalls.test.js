// Browser-free draw-call snapshot for chart primitives (the non-series drawing
// in chart.visual.spec.ts: price/order lines). A primitive is driven through
// its public pane-view renderer with a real CanvasRenderTarget2D wrapping the
// recording context — no browser, no pixels.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const { createRecordingContext } = require('./recording-context.js');
const { CanvasRenderTarget2D } = require('../../src/core/render/canvas-render-target.js');
const { PriceLinesPrimitive } = require('../../src/core/primitives/price-lines-primitive.js');

const SNAP_DIR = join(__dirname, '..', '..', 'render', '__snapshots__');
const SNAP_FILE = join(SNAP_DIR, 'primitives-drawcalls.snap.txt');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

const RECT = { x: 0, y: 0, width: 400, height: 200 };
const PANE = { ...RECT, plot: { ...RECT } };
const PRICE = { min: 88, max: 122 };
const priceToCoordinate = (p) => RECT.y + ((PRICE.max - p) / (PRICE.max - PRICE.min)) * RECT.height;

// A minimal price line entry: a series exposing priceToCoordinate + a line whose
// raw() returns the drawable options (matches InternalPriceLine.raw()).
function entry(price, title, color) {
    return {
        series: { priceToCoordinate, priceScaleId: () => 'right' },
        formatPrice: (p) => p.toFixed(2),
        // InternalPriceLine carries mutable label-placement state used by the
        // collision-avoidance pass; labelOffset must start null (not undefined).
        line: {
            labelOffset: null,
            displayY: 0,
            raw: () => ({
                price, title, color,
                lineVisible: true, lineWidth: 1, lineStyle: 0,
                axisLabelVisible: true, anchored: false,
            }),
        },
    };
}

function priceLinesOps() {
    const { ctx, ops } = createRecordingContext();
    const target = new CanvasRenderTarget2D(ctx, RECT.width, RECT.height, 1, PANE);
    const entries = [entry(112, 'Order', '#26a69a'), entry(96, 'Stop', '#ef5350')];
    const primitive = new PriceLinesPrimitive(() => entries, () => '12px sans-serif');
    const view = primitive.paneViews()[0];
    view.renderer().draw(target);
    return ops;
}

function render() {
    const ops = priceLinesOps();
    return `## PriceLines (${ops.length} ops)\n${ops.join('\n')}\n`;
}

describe('chart primitives: draw-call snapshot (browser-free)', () => {
    it('price lines draw through a real render target without a browser', () => {
        const ops = priceLinesOps();
        assert.ok(ops.length > 0, 'primitive must emit draw calls');
        assert.ok(ops.some((o) => o.startsWith('fillText(')), 'price lines draw their labels');
        assert.ok(!render().includes('NaN'), 'no NaN coordinates');
    });

    it('is deterministic across runs', () => {
        assert.equal(render(), render());
    });

    it('matches the committed snapshot', () => {
        const current = render();
        if (UPDATE || !existsSync(SNAP_FILE)) {
            mkdirSync(SNAP_DIR, { recursive: true });
            writeFileSync(SNAP_FILE, current);
            return;
        }
        assert.equal(current, readFileSync(SNAP_FILE, 'utf8'));
    });
});
