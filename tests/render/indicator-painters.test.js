// Browser-free equivalent of indicator-painters.visual.spec.ts.
//
// Indicator painters do NOT draw to a canvas — they MAP indicator outputs to
// chart series (addSeries) and pick palette colours. So the browser-free
// verification snapshots that mapping (which series, with which options, in
// which order) for every registered painter — no browser, no pixels, no DOM.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const { createIndicatorPainter } = require('../../src/chart/indicators/painters/indicator-painter-registry.js');
const { DefaultIndicatorPainter } = require('../../src/chart/indicators/painters/default-painter.js');
const { registerBuiltInIndicatorPainters } = require('../../src/chart/indicators/painters/builtin-painters.js');
registerBuiltInIndicatorPainters(); // register the built-ins for this snapshot

const SNAP_DIR = join(__dirname, '..', '..', 'render', '__snapshots__');
const SNAP_FILE = join(SNAP_DIR, 'indicator-painters.snap.txt');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

// Catalog painter names registered by builtin-painters.ts.
const PAINTERS = [
    'band', 'macd-histogram', 'ppo-histogram', 'stochastic', 'adx', 'alligator',
    'ichimoku', 'dots', 'fractals', 'gator', 'volume', 'directional-histogram', 'dual-line',
];

const PALETTE = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4dd0e1'];
const OUTPUT = [
    { time: 0, value: 1, upper: 2, lower: 0, open: 1, close: 1.2 },
    { time: 1, value: 2, upper: 3, lower: 1, open: 1.2, close: 1.1 },
    { time: 2, value: 1.5, upper: 2.5, lower: 0.5, open: 1.1, close: 1.6 },
    { time: 3, value: 2.5, upper: 3.5, lower: 1.5, open: 1.6, close: 2.4 },
    { time: 4, value: 2, upper: 3, lower: 1, open: 2.4, close: 2.0 },
];

function fakeContext() {
    const ops = [];
    let ci = 0;
    const context = {
        chart: {},
        entry: { type: 'TestIndicator', outputNames: undefined },
        data: OUTPUT,
        settings: { name: 'TestIndicator' },
        nextColor() { const c = PALETTE[ci % PALETTE.length]; ci++; return c; },
        output(name) { ops.push(`output(${JSON.stringify(name ?? null)})`); return OUTPUT; },
        addSeries(kind, options, data) {
            ops.push(`addSeries(${JSON.stringify(kind)}, ${JSON.stringify(options)}, data[${Array.isArray(data) ? data.length : 0}])`);
            return {
                createPriceLine(o) { ops.push(`  createPriceLine(${JSON.stringify(o)})`); return {}; },
                applyOptions() {}, setData() {},
            };
        },
    };
    return { context, ops };
}

function paintOps(name, painter) {
    const { context, ops } = fakeContext();
    const result = painter.paint(context);
    ops.push(`=> series: ${(result?.series || []).length}`);
    return `## ${name}\n${ops.join('\n')}`;
}

function render() {
    const parts = [];
    parts.push(paintOps('(default)', new DefaultIndicatorPainter()));
    for (const name of PAINTERS) {
        const painter = createIndicatorPainter(name);
        if (!painter) { parts.push(`## ${name}\n<< not registered >>`); continue; }
        parts.push(paintOps(name, painter));
    }
    return parts.join('\n\n') + '\n';
}

describe('indicator painters: series-mapping snapshot (browser-free)', () => {
    it('every registered painter produces series without a browser', () => {
        for (const name of PAINTERS) assert.ok(createIndicatorPainter(name), `painter '${name}' must be registered`);
        const current = render();
        assert.ok(current.includes('addSeries('), 'painters must map outputs to series');
        assert.ok(!current.includes('undefined,'), 'no undefined series option blocks');
    });

    it('is deterministic across runs', () => {
        assert.equal(render(), render());
    });

    it('matches the committed mapping snapshot', () => {
        const current = render();
        if (UPDATE || !existsSync(SNAP_FILE)) {
            mkdirSync(SNAP_DIR, { recursive: true });
            writeFileSync(SNAP_FILE, current);
            return;
        }
        assert.equal(current, readFileSync(SNAP_FILE, 'utf8'));
    });
});
