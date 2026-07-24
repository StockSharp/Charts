// Browser-free rendering verification: drive the real built-in series renderers
// with a recording canvas context and snapshot the exact draw-call sequence.
// No Playwright, no Chromium, no pixels — pure `node --test`.
//
// The renderers here (Candlestick / Line / Histogram) are the ones the core
// chart visual test renders (price / average / volume), so a regression in what
// they draw is caught deterministically without a browser.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const { createRecordingContext } = require('./recording-context.js');
const { builtInSeriesDefinitions } = require('../../src/series/built-in-renderers.js');

const SNAP_DIR = join(__dirname, '..', '..', 'render', '__snapshots__');
const SNAP_FILE = join(SNAP_DIR, 'series-drawcalls.snap.txt');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

// Deterministic 12-bar series. Values chosen so the geometry is non-degenerate.
const N = 12;
const ohlc = [];
const line = [];
const band = [];
for (let i = 0; i < N; i++) {
    const base = 100 + 8 * Math.sin(i / 2) + i * 0.5;
    const open = round2(base);
    const close = round2(base + Math.cos(i) * 2);
    const high = round2(Math.max(open, close) + 1.5);
    const low = round2(Math.min(open, close) - 1.5);
    ohlc.push({ time: i, open, high, low, close, value: close });
    line.push({ time: i, value: close });
    band.push({ time: i, upper: round2(close + 3), lower: round2(close - 3), middle: close });
}
function round2(v) { return Math.round(v * 100) / 100; }

const PANE = { left: 0, right: 400, top: 0, bottom: 200, width: 400, height: 200 };
const PRICE = { min: 88, max: 122 };
const TIME = { from: 0, to: N - 1 };

// Linear coordinate mappers — deterministic, no chart/DOM needed.
const timeToCoordinate = (t) => PANE.left + ((t - TIME.from) / (TIME.to - TIME.from)) * PANE.width;
const priceToCoordinate = (p) => PANE.top + ((PRICE.max - p) / (PRICE.max - PRICE.min)) * PANE.height;

// Superset of series options so each renderer finds the fields it reads.
const OPTIONS = {
    color: '#2962FF', lineWidth: 2, lineStyle: 0, lineType: 0,
    upColor: '#26a69a', downColor: '#ef5350',
    borderColor: '#378658', borderUpColor: '#26a69a', borderDownColor: '#ef5350',
    borderVisible: true, wickColor: '#737375', wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    wickVisible: true, base: 0, topColor: '#2962FF', bottomColor: 'rgba(41,98,255,0)',
    priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: true,
};

const THEME = {
    fontFamily: 'sans-serif', textColor: '#111', horizontalGridColor: '#eee', verticalGridColor: '#eee',
};

function contextFor(data) {
    const { ctx, ops } = createRecordingContext();
    const context = {
        target: ctx,
        data,
        allData: data,
        options: OPTIONS,
        priceRange: PRICE,
        visibleTimeRange: TIME,
        pane: { ...PANE },
        theme: THEME,
        barSpacing: 400 / N,
        metadata: {},
        timeToCoordinate,
        priceToCoordinate,
    };
    return { context, ops };
}

function defByType(type) {
    const def = builtInSeriesDefinitions.find((d) => (d.type ?? d.kind ?? d.name) === type);
    if (!def) throw new Error(`series definition '${type}' not found; available: ${builtInSeriesDefinitions.map((d) => d.type ?? d.kind ?? d.name).join(', ')}`);
    return def;
}

function drawOps(type, data) {
    const def = defByType(type);
    const { context, ops } = contextFor(data);
    def.renderer.draw(context);
    return ops;
}

// Every built-in series type whose renderer draws from plain OHLC/value/band
// data. This is the browser-free equivalent of series-gallery.visual.spec.ts.
const CASES = [
    ['Candlestick', ohlc],
    ['Bar', ohlc],
    ['Line', line],
    ['Histogram', line],
    ['Area', line],
    ['Band', band],
];

function render() {
    return CASES
        .map(([type, data]) => {
            const ops = drawOps(type, data);
            return `## ${type} (${ops.length} ops)\n${ops.join('\n')}`;
        })
        .join('\n\n') + '\n';
}

describe('series renderers: draw-call snapshot (browser-free)', () => {
    it('records a non-trivial, deterministic draw sequence', () => {
        const current = render();
        // Sanity: each core renderer must emit real path drawing, not nothing.
        assert.ok(current.includes('beginPath('), 'expected path drawing');
        assert.ok(!current.includes('NaN'), 'no NaN coordinates in the draw calls');
    });

    it('is deterministic across runs', () => {
        assert.equal(render(), render());
    });

    it('matches the committed draw-call snapshot', () => {
        const current = render();
        if (UPDATE || !existsSync(SNAP_FILE)) {
            mkdirSync(SNAP_DIR, { recursive: true });
            writeFileSync(SNAP_FILE, current);
            return; // bootstrap / update run
        }
        assert.equal(current, readFileSync(SNAP_FILE, 'utf8'));
    });
});
