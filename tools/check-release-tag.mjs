import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (typeof tag !== 'string' || tag.length === 0) {
    console.error('Release tag is required: npm run release:check -- v<package-version>');
    process.exitCode = 1;
} else {
    const expected = `v${packageJson.version}`;
    if (tag !== expected) {
        console.error(`Release tag ${tag} does not match package version ${packageJson.version}; expected ${expected}.`);
        process.exitCode = 1;
    } else if (packageJson.private === true) {
        console.error('package.json still has private=true; npm would refuse publication.');
        process.exitCode = 1;
    } else {
        console.log(`${packageJson.name}@${packageJson.version} matches release tag ${tag}.`);
    }
}
