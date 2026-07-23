const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mkdir, mkdtemp, rm, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const {
    buildPublicApiManifest,
    declarationModuleSpecifiers,
} = require('../tools/public-api-manifest.mjs');

describe('public API manifest', () => {
    it('parses declaration imports without treating comments as dependencies', () => {
        const source = `
            // export * from './comment.js';
            export * from './feature.js';
            import type { Model } from "./model.js";
            export type Lazy = import('./lazy.js').Lazy;
            import 'external-package';
        `;
        assert.deepEqual(declarationModuleSpecifiers(source), [
            './feature.js',
            './model.js',
            './lazy.js',
            'external-package',
        ]);
    });

    it('starts at the package entry and includes only reachable declarations in stable order', async () => {
        const root = await mkdtemp(join(tmpdir(), 'sschart-api-manifest-'));
        try {
            await mkdir(join(root, 'nested'));
            await writeFile(join(root, 'index.d.ts'), "export * from './feature.js';\n", 'utf8');
            await writeFile(
                join(root, 'feature.d.ts'),
                "import type { Model } from './nested/model.js';\nexport interface Feature { model: Model; }\n",
                'utf8',
            );
            await writeFile(join(root, 'nested', 'model.d.ts'), 'export interface Model { id: string; }\n', 'utf8');
            await writeFile(join(root, 'unreachable.d.ts'), 'export interface Hidden {}\n', 'utf8');

            const manifest = await buildPublicApiManifest(root);
            assert.deepEqual(
                [...manifest.matchAll(/^\/\/ Public API module: (.+)$/gm)].map((match) => match[1]),
                ['index.d.ts', 'feature.d.ts', 'nested/model.d.ts'],
            );
            assert.doesNotMatch(manifest, /Hidden/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('rejects missing relative declarations', async () => {
        const root = await mkdtemp(join(tmpdir(), 'sschart-api-manifest-'));
        try {
            await writeFile(join(root, 'index.d.ts'), "export * from './missing.js';\n", 'utf8');
            await assert.rejects(buildPublicApiManifest(root), /no emitted declaration was found/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
