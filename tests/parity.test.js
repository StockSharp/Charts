// Parity between the client indicator catalog (src/chart/indicators/catalog.json) and the
// authoritative StockSharp indicators. The C# side is read LIVE at test time from the StockSharp
// .NET core: tools/csharp-catalog is a tiny dumper that references the StockSharp.Algo NuGet and
// prints the reflected indicator catalog (kind, pane, measure, output count, param keys/types/
// defaults) as JSON. No committed fixture, no dependency on any other repo.
//
// Hard assertions:
//   * every catalog param key is actually read by that indicator's calc fn (pure TS — always runs).
//   * every client indicator kind is a real StockSharp indicator (runs when the .NET dump is
//     available; skipped otherwise so the node-only suite still passes without the SDK).
// Informational (logged, not asserted — the client deliberately differs): pane / param-count deltas.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { getClientCatalog } = require('../src/chart/indicators/calc/index.js');
const { loadDumpStatus, readDump } = require('./csharp-dump.js');

const calcDir = join(__dirname, '..', '..', 'src', 'chart', 'indicators', 'calc');

// The dump is still read live from .NET — no committed fixture — but it is produced once by
// tools/parity-dump.mjs before node:test starts, not by this file racing the other parity file
// over the same build. `status.reason` names why it is absent when it is.
const status = loadDumpStatus();
const csharp = status.available ? readDump('catalog.json') : null;
const csByKind = new Map((csharp || []).map((e) => [e.kind.toLowerCase(), e]));

// Parse calc/index.ts for canon -> calc source file (imports + IMPLEMENTATIONS aliases).
const indexSrc = readFileSync(join(calcDir, 'index.ts'), 'utf8');
const fnToFile = {};
for (const m of indexSrc.matchAll(/import\s*\{\s*(\w+)(?:\s+as\s+(\w+))?\s*\}\s*from\s*'\.\/(\w+)\.js'/g))
    fnToFile[m[2] || m[1]] = m[3];
const canonToFile = {};
for (const m of indexSrc.matchAll(/\{\s*fn:\s*(\w+),\s*aliases:\s*\[([^\]]*)\]/g)) {
    const aliases = m[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    const canon = aliases.find((a) => /^[A-Z]/.test(a)) || aliases[aliases.length - 1];
    canonToFile[canon] = fnToFile[m[1]];
}

// Indicators the client computes that the StockSharp catalog does not surface (client-only).
const CLIENT_ONLY = new Set(['ChaikinOscillator', 'FastStochastic']);

// Deliberate divergences from the StockSharp catalog. Both lists are asserted as exact sets, so
// a new divergence fails and an entry that stops applying fails too — see assertAllowList.

// The client puts the volume family on its own pane. StockSharp reports them as `main` because
// its pane choice follows IndicatorMeasures, and a volume measure carries no "separate" hint;
// drawn as an overlay they would be plotted against the price scale and be unreadable.
const VOLUME_PANE = 'volume-measure indicator: overlaying it on the price scale is unreadable';
const PANE_DELTAS = {
    VolumeIndicator: VOLUME_PANE,
    KlingerVolumeOscillator: VOLUME_PANE,
    Sum: VOLUME_PANE,
    PercentageVolumeOscillator: VOLUME_PANE,
    PriceVolumeTrend: VOLUME_PANE,
    WilliamsAccumulationDistribution: VOLUME_PANE,
    WilliamsVariableAccumulationDistribution: VOLUME_PANE,
};

// Most of these are `cs=0`: a composite indicator keeps its settings on its inner indicators, and
// the reflected catalog only sees settable scalar properties on the outer type. The client has to
// surface those inner lengths for the settings dialog, so it declares them on the outer entry.
const COMPOSITE_INNER_PARAMS = 'composite: StockSharp keeps these settings on the inner indicators, the client surfaces them on the outer entry';
const PARAM_COUNT_DELTAS = {
    MovingAverageConvergenceDivergence: COMPOSITE_INNER_PARAMS,
    MovingAverageConvergenceDivergenceSignal: COMPOSITE_INNER_PARAMS,
    StochasticOscillator: COMPOSITE_INNER_PARAMS,
    Alligator: COMPOSITE_INNER_PARAMS,
    Ichimoku: COMPOSITE_INNER_PARAMS,
    AwesomeOscillator: COMPOSITE_INNER_PARAMS,
    Acceleration: COMPOSITE_INNER_PARAMS,
    ChaikinVolatility: COMPOSITE_INNER_PARAMS,
    CompositeMomentum: COMPOSITE_INNER_PARAMS,
    ElderImpulseSystem: COMPOSITE_INNER_PARAMS,
    GatorOscillator: COMPOSITE_INNER_PARAMS,
    KnowSureThing: COMPOSITE_INNER_PARAMS,
    McClellanOscillator: COMPOSITE_INNER_PARAMS,
    RelativeVigorIndex: COMPOSITE_INNER_PARAMS,
    RangeActionVerificationIndex: COMPOSITE_INNER_PARAMS,
    // The rest are genuine count differences rather than the composite pattern, left as-is
    // because the client's parameter set is the one its settings dialog needs.
    Trix: 'client exposes Length only; StockSharp also exposes the inner SMA length',
    KasePeakOscillator: 'client exposes both cycle lengths plus a smoothing length',
    OptimalTracking: 'client takes no parameters; StockSharp exposes one',
    SchaffTrendCycle: 'client exposes the full MACD + stochastic parameter set',
    PercentagePriceOscillator: 'client exposes both MA lengths plus the signal length',
};

// Compare an observed set against an allow-list, failing on BOTH unexpected members and stale
// entries. The two mean opposite things: something new drifted in, versus something was fixed
// and its exemption should be deleted.
function assertAllowList(observed, allowed, what) {
    const unexpected = observed.filter((k) => !(k in allowed));
    const stale = Object.keys(allowed).filter((k) => !observed.includes(k));
    const problems = [];
    if (unexpected.length) problems.push(`${what} NOT in the allow-list: ${unexpected.join(', ')}`);
    if (stale.length) problems.push(`${what} allow-list entries that no longer apply (remove them): ${stale.join(', ')}`);
    assert.equal(problems.length, 0, problems.join('\n'));
}

const catalog = getClientCatalog();

// Source of a calc file plus, one level deep, any calc it forwards `params` to wholesale (e.g.
// gator -> alligator). With a word-boundary match this also sees params read via destructuring.
const srcCache = {};
function reachableSrc(file, depth = 0) {
    if (!file) return '';
    if (srcCache[file] !== undefined) return srcCache[file];
    let src = '';
    try { src = readFileSync(join(calcDir, `${file}.ts`), 'utf8'); } catch { return ''; }
    let combined = src;
    if (depth < 1)
        for (const mm of src.matchAll(/calc(\w+)\s*\([^)]*\bparams\b/g)) combined += '\n' + reachableSrc(mm[1].toLowerCase(), depth + 1);
    srcCache[file] = combined;
    return combined;
}

describe('indicator catalog parity with StockSharp', () => {
    it('lists a non-trivial catalog', () => {
        assert.ok(catalog.length > 120, `expected the full client catalog, got ${catalog.length}`);
    });

    it('every catalog param key is actually consumed by its calc fn', () => {
        const bad = [];
        for (const e of catalog) {
            const file = canonToFile[e.serverKind];
            if (!file) { if (e.params.length) bad.push(`${e.id}: no calc source mapped`); continue; }
            const src = reachableSrc(file);
            for (const p of e.params)
                if (!new RegExp(`\\b${p.key}\\b`).test(src)) bad.push(`${e.id}: param '${p.key}' is never used in ${file}.ts`);
        }
        assert.equal(bad.length, 0, 'catalog/calc param drift:\n' + bad.join('\n'));
    });

    it('every client indicator kind exists in the StockSharp catalog', (t) => {
        if (!csharp) return t.skip(`StockSharp .NET dump unavailable: ${status.reason}`);
        const missing = catalog.filter((e) => !csByKind.has(e.serverKind.toLowerCase()) && !CLIENT_ONLY.has(e.id));
        assert.equal(missing.length, 0, 'client kinds absent from StockSharp: ' + missing.map((e) => e.id).join(', '));
    });

    it('pane / param-count deltas vs StockSharp are all known ones', (t) => {
        if (!csharp) return t.skip(`StockSharp .NET dump unavailable: ${status.reason}`);
        const paneDiffs = [];
        const countDiffs = [];
        for (const e of catalog) {
            const cs = csByKind.get(e.serverKind.toLowerCase());
            if (!cs) continue;
            const csPane = cs.pane === 'main' ? 'overlay' : 'separate';
            if (e.pane !== csPane) paneDiffs.push(e.id);
            if (e.params.length !== cs.params.length) countDiffs.push(e.id);
        }
        if (paneDiffs.length) console.log(`[parity] pane deltas (${paneDiffs.length}): ` + paneDiffs.join(', '));
        if (countDiffs.length) console.log(`[parity] param-count deltas (${countDiffs.length}): ` + countDiffs.join(', '));

        // These used to be printed and forgotten, which meant a genuinely new divergence looked
        // exactly like the twenty-seven we have decided to live with. Both lists are now exact.
        assertAllowList(paneDiffs, PANE_DELTAS, 'pane placements differing from StockSharp');
        assertAllowList(countDiffs, PARAM_COUNT_DELTAS, 'param counts differing from StockSharp');
    });
});
