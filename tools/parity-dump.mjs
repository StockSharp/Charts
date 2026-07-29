// Produce the StockSharp indicator dumps ONCE, before node:test starts.
//
// Why this exists: tests/parity.test.js and tests/numeric-parity.test.js each used to shell
// out to `dotnet build` on tools/csharp-catalog at module load. node:test runs the bundled
// test files in parallel workers, so both builds hit the same project at the same time and
// one of them died with
//   CSC : error CS2012: Cannot open '...\obj\Release\net10.0\csharp-catalog.dll' for writing
// The loser's bare catch turned that into a skip labelled "no dotnet SDK" — while the SDK was
// installed and the other file's dump had just succeeded. Which file lost was random: two
// consecutive runs skipped different ones, and both exited 0.
//
// Building here, once, before any parallelism starts, removes the race structurally rather
// than by convention: a third parity test file cannot reintroduce it.
//
// It also splits "cannot run here at all" from "tried and failed". The three unavailable
// reasons below are detected deliberately and named in the skip message; anything else — a
// broken build, a dumper that crashes, output that is not JSON — exits non-zero and fails
// `npm test` with the captured output instead of being swallowed.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const projDir = join(here, 'csharp-catalog');
const projFile = join(projDir, 'csharp-catalog.csproj');
const cacheDir = join(repoRoot, '.parity-cache');
const dll = join(projDir, 'bin', 'Release', 'net10.0', 'csharp-catalog.dll');

function writeStatus(status) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, 'status.json'), JSON.stringify(status, null, 2));
}

function unavailable(reason, detail) {
    writeStatus({ available: false, reason, detail: detail ?? null });
    console.log(`[parity-dump] unavailable: ${reason}${detail ? ` (${detail})` : ''} — parity tests will skip`);
    process.exit(0);
}

function fail(what, log) {
    console.error(`[parity-dump] ${what}`);
    if (log) console.error(log);
    process.exit(1);
}

// The StockSharp checkout the dumper compiles against. Read the path out of the csproj rather
// than repeating it here, so the two cannot drift apart.
function stockSharpRef() {
    const csproj = readFileSync(projFile, 'utf8');
    const m = csproj.match(/<ProjectReference\s+Include="([^"]+)"/);
    if (!m) fail(`no <ProjectReference> found in ${projFile}`);
    const raw = m[1].replace(/\\/g, '/');
    return isAbsolute(raw) ? raw : resolve(projDir, raw);
}

// This is the CI path and it must not depend on dotnet being present at all: GitHub checks out
// only this repo, so the sibling StockSharp source is simply not there.
const ssRef = stockSharpRef();
if (!existsSync(ssRef)) unavailable('stocksharp-checkout-absent', ssRef);

let sdks;
try {
    sdks = execFileSync('dotnet', ['--list-sdks'], { encoding: 'utf8', timeout: 60000 });
} catch (err) {
    if (err.code === 'ENOENT') unavailable('dotnet-missing');
    unavailable('dotnet-sdk-missing', `dotnet --list-sdks exited ${err.status ?? err.code}`);
}
// `dotnet --list-sdks` prints "<version> [<path>]" per SDK; a runtime-only install lists none.
if (!/^\d+\.\d+\.\d+.*\[/m.test(sdks)) unavailable('dotnet-sdk-missing', 'no SDK listed');

// Always build. MSBuild's own incrementality is the only correct staleness check against the
// StockSharp source tree — do not replace this with an mtime walk, or the cache goes silently
// stale against the very changes these tests exist to catch.
try {
    execFileSync('dotnet', ['build', projFile, '-c', 'Release', '--nologo', '-v', 'q'], {
        encoding: 'utf8',
        timeout: 600000,
        maxBuffer: 64 * 1024 * 1024,
    });
} catch (err) {
    fail('dotnet build failed while both the SDK and the StockSharp checkout are present',
        [err.stdout, err.stderr].filter(Boolean).join('\n'));
}

if (!existsSync(dll)) fail(`build succeeded but ${dll} is missing — TargetFramework or AssemblyName drift?`);

const { mtimeMs, size } = statSync(dll);
const stamp = `${mtimeMs}:${size}`;

const statusFile = join(cacheDir, 'status.json');
if (existsSync(statusFile)) {
    try {
        const prev = JSON.parse(readFileSync(statusFile, 'utf8'));
        if (prev.available && prev.stamp === stamp) {
            JSON.parse(readFileSync(join(cacheDir, 'catalog.json'), 'utf8'));
            JSON.parse(readFileSync(join(cacheDir, 'values.json'), 'utf8'));
            console.log('[parity-dump] reusing cached dump (dumper unchanged since last run)');
            process.exit(0);
        }
    } catch {
        // A stale or half-written cache is not an error — it just means we regenerate below.
    }
}

// Exec the dll directly: no MSBuild involvement, so this step cannot contend with anything.
function dump(args, outFile) {
    let out;
    try {
        out = execFileSync('dotnet', [dll, ...args], {
            encoding: 'utf8',
            timeout: 300000,
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch (err) {
        fail(`dumper run failed: dotnet ${dll} ${args.join(' ')}`,
            [err.stdout, err.stderr].filter(Boolean).join('\n'));
    }
    try {
        JSON.parse(out);
    } catch (err) {
        fail(`dumper output is not valid JSON: dotnet ${dll} ${args.join(' ')}`, `${err.message}\n${out.slice(0, 2000)}`);
    }
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, outFile), out);
}

dump([], 'catalog.json');
dump(['--values'], 'values.json');

writeStatus({ available: true, stamp });
console.log('[parity-dump] dump ready in .parity-cache');
