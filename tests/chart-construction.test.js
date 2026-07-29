// Construct a real chart with no browser.
//
// This exists because ChartImpl's constructor was covered only by Playwright, so the DOM surface
// it depends on was pinned nowhere that `npm test` could see. The StockSharp terminal's headless
// suite found that out the hard way: its element stub had no `dataset`, and two ordinal-time-scale
// tests died in the constructor with
//     TypeError: Cannot set properties of undefined (setting 'sschartLayer')
// before reaching a single assertion. The engine is not at fault there — `dataset` is baseline
// HTMLElement API and createChart is documented to take an HTMLElement — but the failure surfaced
// two repos away from the change that would cause it, which is the part worth fixing here.

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { createChart, LineSeries, TimeScaleMode } = require('../src/index.js');
const { createHeadlessDom } = require('./headless-dom.js');

let dom = null;

function mount(options) {
    dom = createHeadlessDom();
    return createChart(dom.host, { width: 800, height: 400, ...options });
}

afterEach(() => {
    dom?.restore();
    dom = null;
});

// Six bars an hour apart, then a multi-hour gap, then two more an hour apart.
const GAPPED = [
    { time: 3600, value: 10 },
    { time: 7200, value: 11 },
    { time: 10800, value: 12 },
    { time: 50400, value: 13 },
    { time: 54000, value: 14 },
];

describe('chart construction without a browser', () => {
    it('builds its layers on a baseline HTMLElement host', () => {
        const chart = mount();

        const root = dom.host.children[0];
        assert.ok(root, 'the chart appends a root element to the host');
        assert.equal(root.className, 'sschart-root');

        const layers = root.children.map((c) => c.dataset.sschartLayer);
        assert.deepStrictEqual(layers, ['base', 'overlay'],
            'both canvases are tagged via dataset — a host element without `dataset` must not be assumed');

        chart.remove();
    });

    it('takes a 2d context for each layer and actually draws', () => {
        const chart = mount();
        const series = chart.addSeries(LineSeries);
        series.setData(GAPPED);
        chart.timeScale().fitContent();

        // Constructing proves very little on its own — the draw path is where a half-stubbed
        // context turns into a crash instead of a silent no-op. Frames are queued, so force them.
        let ran = 0;
        assert.doesNotThrow(() => { ran = dom.flushFrames(); });
        assert.ok(ran > 0, 'setData/fitContent must have scheduled at least one frame');
        chart.remove();
    });

    it('ordinal mode collapses a gap to the in-session bar step', () => {
        const chart = mount({ timeScale: { mode: TimeScaleMode.Ordinal } });
        const series = chart.addSeries(LineSeries);
        series.setData(GAPPED);
        chart.timeScale().fitContent();

        const xs = GAPPED.map((p) => chart.timeScale().timeToCoordinate(p.time));
        for (const x of xs) assert.ok(typeof x === 'number' && Number.isFinite(x), `expected a coordinate, got ${x}`);

        const steps = [];
        for (let i = 1; i < xs.length; i++) steps.push(xs[i] - xs[i - 1]);
        const inSession = steps[0];
        for (const step of steps) {
            assert.ok(Math.abs(step - inSession) < 1e-6,
                `ordinal spacing must ignore wall-clock distance: steps ${steps.join(', ')}`);
        }
        chart.remove();
    });

    it('continuous mode keeps the gap proportional to elapsed time (control)', () => {
        const chart = mount({ timeScale: { mode: TimeScaleMode.Continuous } });
        const series = chart.addSeries(LineSeries);
        series.setData(GAPPED);
        chart.timeScale().fitContent();

        const xs = GAPPED.map((p) => chart.timeScale().timeToCoordinate(p.time));
        const inSession = xs[1] - xs[0];
        const overGap = xs[3] - xs[2];
        assert.ok(overGap > inSession * 2,
            `the 11-hour gap must be wider than a 1-hour step: gap ${overGap} vs step ${inSession}`);
        chart.remove();
    });
});
