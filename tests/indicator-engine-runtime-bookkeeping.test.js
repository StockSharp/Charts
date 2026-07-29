// Pins the runtime bookkeeping fields an indicator entry is created with.
//
// `_runtimeLastCommittedTime` used to be omitted from the literal in add(), unlike its two
// siblings `_runtimeFirstTime` and `_runtimePreviewTime`, so between add() and the first runtime
// pass it was `undefined` rather than null. _sourceNeedsHistoricalReset tested it with
// `!== null`, which an absent field passes — and then compared
// `upstream._outputChangedFromTime <= undefined`, which is false only because every comparison
// with undefined is. The right answer for the wrong reason: initialise one of those fields
// differently and the accident stops holding.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.SSChart = {
    LineSeries: { type: 'Line' },
    HistogramSeries: { type: 'Histogram' },
    AreaSeries: { type: 'Area' },
    BandSeries: { type: 'Band' },
};

const { IndicatorEngine } = require('../src/chart/indicators/indicator-engine.js');
const { IndicatorSourceKind } = require('../src/indicators/index.js');

// The bookkeeping under test is independent of drawing, so the renderer is a no-op double: it
// only has to exist, because add() renders as part of its reset cascade.
function engineWithoutDrawing() {
    const engine = new IndicatorEngine();
    engine._renderer = {
        render: () => [],
        update: () => { },
        prepareRuntime: () => { },
        updateRuntime: () => false,
        removeSeries: () => { },
        getLastColors: () => [],
    };
    return engine;
}

function addSma(engine, params = { length: 3 }, persistence) {
    engine.add('SimpleMovingAverage', params, undefined, persistence);
    return engine._indicators[engine._indicators.length - 1];
}

function sourcedTo(upstream) {
    return {
        source: {
            kind: IndicatorSourceKind.IndicatorOutput,
            indicatorId: upstream.persistenceId,
            outputId: 'line',
        },
    };
}

describe('indicator entry runtime bookkeeping', () => {
    it('initialises every runtime time field to null, not undefined', () => {
        const entry = addSma(engineWithoutDrawing());

        // All three describe "where the runtime has got to". None of them may start absent:
        // an absent field and a null one behave differently under every operator except ==.
        for (const field of ['_runtimeFirstTime', '_runtimePreviewTime', '_runtimeLastCommittedTime']) {
            assert.ok(field in entry, `${field} must be present on a fresh entry`);
            assert.strictEqual(entry[field], null, `${field} must start as null`);
        }
    });

    it('does not ask for a historical reset before anything has been committed', () => {
        const engine = engineWithoutDrawing();
        const upstream = addSma(engine);
        const downstream = addSma(engine, { length: 5 }, sourcedTo(upstream));

        // Upstream has moved on from the very first bar, which is the case that used to depend on
        // an undefined comparison rather than on the null check.
        upstream._outputRevision = 1;
        upstream._outputChangedFromTime = -Infinity;
        downstream._sourceRevision = null;

        assert.strictEqual(engine._sourceNeedsHistoricalReset(downstream), false,
            'nothing has been committed yet, so there is no history to reset');
    });

    it('asks for a historical reset once the upstream rewrites a committed bar', () => {
        const engine = engineWithoutDrawing();
        const upstream = addSma(engine);
        const downstream = addSma(engine, { length: 5 }, sourcedTo(upstream));

        downstream._runtimeLastCommittedTime = 5000;
        upstream._outputRevision = 1;
        downstream._sourceRevision = null;

        upstream._outputChangedFromTime = 4000;
        assert.strictEqual(engine._sourceNeedsHistoricalReset(downstream), true,
            'the upstream changed a bar at or before our last committed one');

        upstream._outputChangedFromTime = 6000;
        assert.strictEqual(engine._sourceNeedsHistoricalReset(downstream), false,
            'the upstream only changed bars after our last committed one');
    });
});
