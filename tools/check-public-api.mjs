import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildPublicApiManifest } from './public-api-manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = join(root, 'tests', 'api', 'sschart.d.ts');
const tscPath = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const update = process.argv.includes('--update');
const temp = await mkdtemp(join(tmpdir(), 'sschart-api-'));

try {
    const result = spawnSync(
        process.execPath,
        [tscPath, '-p', join(root, 'tsconfig.api.json'), '--outDir', temp],
        { cwd: root, encoding: 'utf8' },
    );
    if (result.status !== 0) {
        process.stderr.write(result.stdout || '');
        process.stderr.write(result.stderr || '');
        throw new Error(`TypeScript declaration emit failed with exit code ${result.status ?? 1}.`);
    }

    const normalized = await buildPublicApiManifest(temp);

    if (update) {
        await mkdir(dirname(snapshotPath), { recursive: true });
        await writeFile(snapshotPath, normalized, 'utf8');
        console.log('updated ' + snapshotPath);
    } else {
        let expected;
        try {
            expected = (await readFile(snapshotPath, 'utf8')).replaceAll('\r\n', '\n');
        } catch {
            throw new Error('Public API snapshot is missing. Run npm run api:update.');
        }

        if (expected !== normalized) {
            throw new Error(
                'Public API changed. Review the generated declaration, then run npm run api:update if the change is intentional.',
            );
        }
        console.log('public API snapshot matches');
    }
} finally {
    await rm(temp, { recursive: true, force: true });
}
