// Numeric parity: run the SAME deterministic candle series through BOTH the authoritative
// StockSharp C# indicator and the client JS calc port, and assert the per-bar outputs match.
//
// The C# side is read LIVE from tools/csharp-catalog run with `--values`: it builds a fixed
// deterministic OHLCV series, processes each indicator with its default params, and prints
//   { input: [{ t, o, h, l, c, v }, ...],
//     indicators: [{ kind, params, values: (number|null)[] }, ...] }
// (single-output indicators only for now; multi-output lines come later and are skipped here).
//
// If the .NET SDK / StockSharp source is unavailable the whole suite skips (like parity.test.js).
// Otherwise every indicator in ASSERT_KINDS must match bar-for-bar within TOL; the rest are logged.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const { getCalcFn } = require('../src/chart/indicators/calc/index.js');

const dumperProj = join(__dirname, '..', '..', 'tools', 'csharp-catalog');

// Relative + absolute tolerance for decimal (C#) vs double (JS).
const TOL = 1e-6;

// Multi-output JS calcs return an object of line arrays; the C# indicator exposes a
// single scalar (its primary line). Map each to the JS field that line corresponds to.
const MULTI_LINE = {
    MovingAverageConvergenceDivergence: 'macd',
    PercentagePriceOscillator: 'ppo',
    SuperTrend: 'value',
    MovingAverageCrossover: 'signal',
};

// Genuinely non-scalar indicators: the C# exposes no single line (GetValue is null),
// so they are out of scope for the scalar bar-for-bar parity.
const NON_SCALAR = new Set(['VolumeProfileIndicator']);

// StockSharp kinds asserted bar-for-bar: single `Length` param, single output — the unambiguous core.
const ASSERT_KINDS = [
    'SimpleMovingAverage',
    'ExponentialMovingAverage',
    'WeightedMovingAverage',
    'SmoothedMovingAverage',
    'RelativeStrengthIndex',
    'AverageTrueRange',
];

// Pull the StockSharp per-bar indicator values live from .NET. Best-effort: if the SDK or the
// StockSharp source is unavailable (or it errors), the checks skip rather than fail the suite.
function loadNumeric() {
    try {
        execFileSync('dotnet', ['build', dumperProj, '-c', 'Release', '--nologo', '-v', 'q'], { stdio: 'ignore', timeout: 600000 });
        const out = execFileSync('dotnet', ['run', '--project', dumperProj, '-c', 'Release', '--no-build', '--', '--values'], { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
        return { ran: true, data: JSON.parse(out) };
    } catch {
        return { ran: false, data: null };
    }
}

const dump = loadNumeric();

// C# param keys are PascalCase (`Length`); the client calc fns read lowercase (`length`).
// The single-`Length` subset maps by a plain lower-case fold.
function toJsParams(csParams) {
    // C# param keys are PascalCase (`Length`, `MomentumPeriod`); the client calc fns
    // read either lower-case (`length`) or camelCase (`momentumPeriod`), so set both.
    const p = {};
    for (const k of Object.keys(csParams || {})) {
        const v = csParams[k];
        p[k.toLowerCase()] = v;
        p[k.charAt(0).toLowerCase() + k.slice(1)] = v;
    }
    return p;
}

function numeric(x) {
    return x !== null && x !== undefined && Number.isFinite(x);
}

// Both formed and within tolerance, OR both not-formed (null/absent).
function close(js, cs) {
    if (!numeric(js) || !numeric(cs)) return !numeric(js) && !numeric(cs);
    return Math.abs(js - cs) <= TOL + TOL * Math.max(Math.abs(js), Math.abs(cs));
}

describe('numeric parity: JS calc vs StockSharp C#', () => {
    it('C# dumper provides a numeric --values dump (input + per-bar values)', (t) => {
        if (!dump.ran) return t.skip('StockSharp .NET dump unavailable (no dotnet SDK / source)');
        assert.ok(dump.data && Array.isArray(dump.data.input) && dump.data.input.length > 30,
            'expected { input: [...] } with a non-trivial series from --values');
        assert.ok(Array.isArray(dump.data.indicators) && dump.data.indicators.some((e) => Array.isArray(e.values)),
            'expected { indicators: [{ kind, values: (number|null)[] }] } from --values');
    });

    it('single-output core indicators match StockSharp bar-for-bar', (t) => {
        if (!dump.ran) return t.skip('StockSharp .NET dump unavailable');
        assert.ok(dump.data && Array.isArray(dump.data.input), 'no numeric dump (--values not implemented)');

        const candles = dump.data.input.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
        const byKind = new Map((dump.data.indicators || []).map((e) => [e.kind, e]));
        const failures = [];

        for (const kind of ASSERT_KINDS) {
            const cs = byKind.get(kind);
            if (!cs || !Array.isArray(cs.values)) { failures.push(`${kind}: absent from C# --values dump`); continue; }
            const fn = getCalcFn(kind);
            if (!fn) { failures.push(`${kind}: no JS calc fn resolved`); continue; }

            const jsOut = fn(candles, toJsParams(cs.params));
            if (!Array.isArray(jsOut) || jsOut.length !== cs.values.length) {
                failures.push(`${kind}: length js=${jsOut && jsOut.length} cs=${cs.values.length}`);
                continue;
            }
            for (let i = 0; i < cs.values.length; i++) {
                const jsv = jsOut[i] ? jsOut[i].value : null;
                if (!close(jsv, cs.values[i])) failures.push(`${kind}[${i}]: js=${jsv} cs=${cs.values[i]}`);
            }
        }
        assert.equal(failures.length, 0, 'numeric parity mismatches:\n' + failures.slice(0, 40).join('\n'));
    });

    // The chart redraws the last (forming) candle as it changes; StockSharp models this by processing
    // a non-final value that never commits. For each perturbed forming bar the JS port — re-running its
    // calc over series + that bar — must land on the same preview the C# indicator yields non-finally.
    it('single-output core indicators match StockSharp on a changing (non-final) last candle', (t) => {
        if (!dump.ran) return t.skip('StockSharp .NET dump unavailable');
        assert.ok(dump.data && Array.isArray(dump.data.probes) && dump.data.probes.length > 0,
            'expected { probes: [...] } from --values for the changing-candle check');

        const base = dump.data.input.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
        const byKind = new Map((dump.data.indicators || []).map((e) => [e.kind, e]));
        const failures = [];

        for (const kind of ASSERT_KINDS) {
            const cs = byKind.get(kind);
            if (!cs || !Array.isArray(cs.previews)) { failures.push(`${kind}: no C# previews`); continue; }
            const fn = getCalcFn(kind);
            if (!fn) { failures.push(`${kind}: no JS calc fn`); continue; }

            for (let pi = 0; pi < dump.data.probes.length; pi++) {
                const p = dump.data.probes[pi];
                const candles = base.concat([{ time: base.length, open: p.o, high: p.h, low: p.l, close: p.c, volume: p.v }]);
                const jsOut = fn(candles, toJsParams(cs.params));
                const jsv = jsOut.length ? (jsOut[jsOut.length - 1] ? jsOut[jsOut.length - 1].value : null) : null;
                if (!close(jsv, cs.previews[pi])) failures.push(`${kind} probe#${pi} (Δclose=${(p.c - base[base.length - 1].close).toFixed(2)}): js=${jsv} cs=${cs.previews[pi]}`);
            }
        }
        assert.equal(failures.length, 0, 'changing-candle parity mismatches:\n' + failures.slice(0, 40).join('\n'));
    });

    // Full coverage: run EVERY scalar C# indicator (single-output, plus the primary line of the
    // multi-output ones) through its JS calc fn over the final series and assert none diverge.
    // This locks in the whole port against StockSharp; non-scalar indicators are excluded explicitly.
    it('every scalar indicator matches StockSharp bar-for-bar', (t) => {
        if (!dump.ran) return t.skip('StockSharp .NET dump unavailable');
        const candles = dump.data.input.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
        const matched = [];
        const diverged = [];
        const noFn = [];
        const excluded = [];
        for (const cs of dump.data.indicators || []) {
            if (!Array.isArray(cs.values)) continue; // complex / multi-output: handled later
            if (NON_SCALAR.has(cs.kind)) { excluded.push(cs.kind); continue; }
            const fn = getCalcFn(cs.kind);
            if (!fn) { noFn.push(cs.kind); continue; }
            let jsOut;
            try { jsOut = fn(candles, toJsParams(cs.params)); }
            catch { diverged.push(cs.kind + '(threw)'); continue; }
            if (MULTI_LINE[cs.kind] && jsOut && !Array.isArray(jsOut)) jsOut = jsOut[MULTI_LINE[cs.kind]];
            if (!Array.isArray(jsOut) || jsOut.length !== cs.values.length) { diverged.push(cs.kind + '(shape)'); continue; }
            const csFormed = cs.values.findIndex((v) => v !== null && v !== undefined);
            let firstMism = -1;
            let postFormedMism = -1;
            for (let i = 0; i < cs.values.length; i++) {
                const jsv = jsOut[i] ? jsOut[i].value : null;
                if (!close(jsv, cs.values[i])) {
                    if (firstMism < 0) firstMism = i;
                    if (csFormed >= 0 && i >= csFormed && postFormedMism < 0) postFormedMism = i;
                }
            }
            if (firstMism < 0) { matched.push(cs.kind); continue; }
            if (csFormed >= 0 && postFormedMism < 0) {
                diverged.push(`${cs.kind} [WARMUP-ONLY csFormed@${csFormed}]`);
            } else {
                const at = postFormedMism < 0 ? firstMism : postFormedMism;
                const smp = [];
                for (let j = at; j < Math.min(at + 3, cs.values.length); j++) {
                    const jv = jsOut[j] ? jsOut[j].value : null;
                    smp.push(`[${j}]js=${jv} cs=${cs.values[j]}`);
                }
                diverged.push(`${cs.kind} [DRIFT csFormed@${csFormed}] ${smp.join('  ')}`);
            }
        }
        console.log(`[numeric-parity] scalar coverage: ${matched.length} match, ${diverged.length} diverge, ${noFn.length} no-js-fn, ${excluded.length} non-scalar`);
        if (noFn.length) console.log('[numeric-parity] no-js-fn:', noFn.join(', '));
        assert.equal(diverged.length, 0, 'indicators diverging from the C# dump:\n' + diverged.join('\n'));
    });

    // Multi-line (complex) indicators: the C# dump carries one value array per inner indicator.
    // The JS calc returns an object of named line arrays. Auto-match each C# line to whichever JS
    // line reproduces it bar-for-bar, so field-name differences don't matter; every C# line must
    // be reproduced by some JS line.
    it('every complex indicator line matches StockSharp bar-for-bar', (t) => {
        if (!dump.ran) return t.skip('StockSharp .NET dump unavailable');
        const candles = dump.data.input.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));

        const asLine = (arr) => arr.map((p) => (p && typeof p === 'object' && !Array.isArray(p)) ? p.value : p);
        const jsLines = (jsOut) => {
            const lines = [];
            const push = (name, arr) => {
                if (!Array.isArray(arr) || arr.length === 0) return;
                if (Array.isArray(arr[0])) arr.forEach((sub, i) => push(name + i, sub)); // ribbon: array of series
                else lines.push({ field: name, values: asLine(arr) });
            };
            if (!jsOut) return lines;
            if (Array.isArray(jsOut)) push('(default)', jsOut);
            else for (const k of Object.keys(jsOut)) push(k, jsOut[k]);
            return lines;
        };
        const lineMatch = (a, b) => a.length === b.length && b.every((v, i) => close(a[i], v));

        const matched = [];
        const diverged = [];
        const noFn = [];
        for (const cs of dump.data.indicators || []) {
            if (!Array.isArray(cs.lines)) continue;
            const fn = getCalcFn(cs.kind);
            if (!fn) { noFn.push(cs.kind); continue; }
            let cand;
            try { cand = jsLines(fn(candles, toJsParams(cs.params))); }
            catch { diverged.push(cs.kind + '(threw)'); continue; }
            const unmatched = [];
            for (let li = 0; li < cs.lines.length; li++) {
                if (!cand.some((jc) => lineMatch(jc.values, cs.lines[li]))) unmatched.push((cs.lineNames && cs.lineNames[li]) + '#' + li);
            }
            if (unmatched.length === 0) matched.push(cs.kind);
            else diverged.push(`${cs.kind} [unmatched: ${unmatched.join(', ')}]`);
        }
        console.log(`[numeric-parity] complex coverage: ${matched.length} match, ${diverged.length} diverge, ${noFn.length} no-js-fn`);
        if (matched.length) console.log('[numeric-parity] complex match:', matched.join(', '));
        if (diverged.length) console.log('[numeric-parity] complex diverge:', diverged.join('  |  '));
        if (noFn.length) console.log('[numeric-parity] complex no-js-fn:', noFn.join(', '));
        assert.equal(diverged.length, 0, 'complex indicators diverging from the C# dump:\n' + diverged.join('\n'));
    });
});
