// Bundle every tests/**/*.test.js into tests/_dist via esbuild so node:test can
// run them directly — the calc modules (ESM TypeScript) are inlined by esbuild,
// the same toolchain that builds the app, so there is a single .ts -> JS path.
import { build } from 'esbuild';
import { readdirSync, statSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const testsDir = join(here, 'tests');
const outDir = join(testsDir, '_dist');
try { rmSync(outDir, { recursive: true, force: true }); } catch { /* first run */ }

function walk(dir, acc = []) {
    for (const entry of readdirSync(dir)) {
        if (entry === '_dist') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, acc);
        else if (full.endsWith('.test.js')) acc.push(full);
    }
    return acc;
}

const entries = walk(testsDir);
await build({
    entryPoints: entries,
    outdir: outDir,
    outbase: testsDir,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    // .cjs so node runs the CJS bundle even though package.json is type:module.
    outExtension: { '.js': '.cjs' },
    target: 'es2020',
    logLevel: 'error',
});
console.log(`bundled ${entries.length} test file(s) -> tests/_dist`);
