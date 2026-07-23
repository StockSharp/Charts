import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const targets = [
    ['performance-entry.ts', 'performance-entry.js'],
    ['indicator-painters-entry.ts', 'indicator-painters-entry.js'],
];

for (const [entry, output] of targets) {
    await build({
        entryPoints: [join(here, 'tests', 'browser', 'fixtures', entry)],
        outfile: join(here, 'tests', 'browser', 'fixtures', '_dist', output),
        bundle: true,
        format: 'iife',
        target: 'es2020',
        logLevel: 'info',
    });
}
