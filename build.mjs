// Build the published package and the demo/unpkg bundles:
//   dist/esm/**      — typed ESM modules (tsc), the npm `main`/`exports` entry
//   dist/types/**    — .d.ts + declaration maps, the npm `types` entry
//   dist/sschart.js  — the engine as the IIFE global `SSChart` (unpkg/jsdelivr,
//                      and the <script> the demo pages load)
//   dist/chart-app.js — the terminal chart stack (indicator engine, renderer,
//                      panes, legend, context-menu, dialog) wired by
//                      src/chart/app.ts; used only by the demo terminal page.
//
//   npm install   # once, to get esbuild + typescript
//   node build.mjs
import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');

// Fixed child of this repository, never a caller-provided path.
await rm(dist, { recursive: true, force: true });

// Typed ESM + .d.ts for npm consumers (tsc drives the public graph from index.ts).
await execFileAsync(
    process.execPath,
    [join(here, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(here, 'tsconfig.build.json')],
    { cwd: here },
);

// IIFE globals: the engine (unpkg/jsdelivr + demo) and the terminal demo app.
const targets = [
    { entryPoints: [join(here, 'src', 'index.ts')], outfile: join(dist, 'sschart.js'), globalName: 'SSChart' },
    { entryPoints: [join(here, 'src', 'chart', 'app.ts')], outfile: join(dist, 'chart-app.js') },
];

for (const t of targets) {
    await build({ ...t, bundle: true, format: 'iife', sourcemap: true, target: 'es2020', logLevel: 'info' });
    console.log('built ' + t.outfile);
}
