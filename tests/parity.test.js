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
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const { getClientCatalog } = require('../src/chart/indicators/calc/index.js');

const calcDir = join(__dirname, '..', '..', 'src', 'chart', 'indicators', 'calc');
const dumperProj = join(__dirname, '..', '..', 'tools', 'csharp-catalog');

// Pull the StockSharp indicator catalog live from .NET. Best-effort: if the SDK or the package is
// unavailable (or it errors), the C#-dependent checks skip rather than fail the suite.
function loadCsharpCatalog() {
    try {
        execFileSync('dotnet', ['build', dumperProj, '-c', 'Release', '--nologo', '-v', 'q'], { stdio: 'ignore', timeout: 600000 });
        const out = execFileSync('dotnet', ['run', '--project', dumperProj, '-c', 'Release', '--no-build'], { encoding: 'utf8', timeout: 120000 });
        return JSON.parse(out);
    } catch {
        return null;
    }
}

const csharp = loadCsharpCatalog();
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
        if (!csharp) return t.skip('StockSharp .NET dump unavailable (no dotnet SDK / package)');
        const missing = catalog.filter((e) => !csByKind.has(e.serverKind.toLowerCase()) && !CLIENT_ONLY.has(e.id));
        assert.equal(missing.length, 0, 'client kinds absent from StockSharp: ' + missing.map((e) => e.id).join(', '));
    });

    it('reports pane / param-count deltas vs StockSharp (informational)', (t) => {
        if (!csharp) return t.skip('StockSharp .NET dump unavailable');
        const paneDiffs = [];
        const countDiffs = [];
        for (const e of catalog) {
            const cs = csByKind.get(e.serverKind.toLowerCase());
            if (!cs) continue;
            const csPane = cs.pane === 'main' ? 'overlay' : 'separate';
            if (e.pane !== csPane) paneDiffs.push(`${e.id}: ts=${e.pane} cs=${csPane}`);
            if (e.params.length !== cs.params.length) countDiffs.push(`${e.id}: ts=${e.params.length} cs=${cs.params.length}`);
        }
        if (paneDiffs.length) console.log(`[parity] pane deltas (${paneDiffs.length}):\n  ` + paneDiffs.join('\n  '));
        if (countDiffs.length) console.log(`[parity] param-count deltas (${countDiffs.length}):\n  ` + countDiffs.join('\n  '));
    });
});
