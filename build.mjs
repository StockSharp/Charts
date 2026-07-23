// Build two IIFE bundles for the demo:
//   dist/sschart.js    — the engine, published as the global `SSChart`
//   dist/chart-app.js  — the real terminal chart stack (indicator engine,
//                        renderer, panes, legend, context-menu, dialog) wired
//                        up by src/chart/app.ts; references the SSChart global.
//
//   npm install   # once, to get esbuild
//   node build.mjs
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const targets = [
    { entryPoints: [join(here, 'src', 'index.ts')], outfile: join(here, 'dist', 'sschart.js'), globalName: 'SSChart' },
    { entryPoints: [join(here, 'src', 'chart', 'app.ts')], outfile: join(here, 'dist', 'chart-app.js') },
];

for (const t of targets) {
    await build({ ...t, bundle: true, format: 'iife', sourcemap: true, target: 'es2020', logLevel: 'info' });
    console.log('built ' + t.outfile);
}
