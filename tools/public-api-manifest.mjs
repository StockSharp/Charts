import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

function normalizeText(value) {
    return value
        .replace(/^\uFEFF/, '')
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .trimEnd() + '\n';
}

function declarationTokens(source) {
    const tokens = [];
    let index = 0;
    while (index < source.length) {
        const current = source[index];
        const next = source[index + 1];
        if (/\s/.test(current)) {
            index += 1;
            continue;
        }
        if (current === '/' && next === '/') {
            index = source.indexOf('\n', index + 2);
            if (index < 0) break;
            continue;
        }
        if (current === '/' && next === '*') {
            const end = source.indexOf('*/', index + 2);
            index = end < 0 ? source.length : end + 2;
            continue;
        }
        if (current === '\'' || current === '"') {
            const quote = current;
            let value = '';
            index += 1;
            while (index < source.length && source[index] !== quote) {
                if (source[index] === '\\' && index + 1 < source.length) index += 1;
                value += source[index];
                index += 1;
            }
            if (index < source.length) index += 1;
            tokens.push({ kind: 'string', value });
            continue;
        }
        if (/[A-Za-z_$]/.test(current)) {
            const start = index;
            index += 1;
            while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) index += 1;
            tokens.push({ kind: 'word', value: source.slice(start, index) });
            continue;
        }
        tokens.push({ kind: 'punctuation', value: current });
        index += 1;
    }
    return tokens;
}

export function declarationModuleSpecifiers(source) {
    const tokens = declarationTokens(source);
    const specifiers = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.kind !== 'word') continue;
        if (token.value === 'from' && tokens[index + 1]?.kind === 'string') {
            specifiers.push(tokens[index + 1].value);
            continue;
        }
        if (token.value !== 'import') continue;
        if (tokens[index + 1]?.kind === 'string') {
            specifiers.push(tokens[index + 1].value);
        } else if (tokens[index + 1]?.value === '(' && tokens[index + 2]?.kind === 'string') {
            specifiers.push(tokens[index + 2].value);
        }
    }
    return [...new Set(specifiers)];
}

function normalizeModuleName(root, file) {
    return relative(root, file).split(sep).join('/');
}

function isInside(root, file) {
    const pathFromRoot = relative(root, file);
    return pathFromRoot === '' || (!isAbsolute(pathFromRoot) && pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`));
}

async function isFile(file) {
    try {
        return (await stat(file)).isFile();
    } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
    }
}

function declarationCandidates(fromFile, specifier) {
    const target = resolve(dirname(fromFile), specifier);
    if (target.endsWith('.d.ts') || target.endsWith('.d.mts') || target.endsWith('.d.cts')) return [target];
    if (target.endsWith('.mjs')) return [`${target.slice(0, -4)}.d.mts`];
    if (target.endsWith('.cjs')) return [`${target.slice(0, -4)}.d.cts`];
    if (target.endsWith('.js')) return [`${target.slice(0, -3)}.d.ts`];
    if (target.endsWith('.mts')) return [`${target.slice(0, -4)}.d.mts`];
    if (target.endsWith('.cts')) return [`${target.slice(0, -4)}.d.cts`];
    if (target.endsWith('.ts')) return [`${target.slice(0, -3)}.d.ts`];
    return [`${target}.d.ts`, `${target}.d.mts`, `${target}.d.cts`, join(target, 'index.d.ts')];
}

async function resolveDeclaration(root, fromFile, specifier) {
    if (!specifier.startsWith('.')) return null;

    const candidates = declarationCandidates(fromFile, specifier);
    for (const candidate of candidates) {
        if (!isInside(root, candidate)) {
            throw new Error(
                `${normalizeModuleName(root, fromFile)} references ${specifier}, which escapes the declaration root.`,
            );
        }
        if (await isFile(candidate)) return candidate;
    }

    throw new Error(
        `${normalizeModuleName(root, fromFile)} references ${specifier}, but no emitted declaration was found.`,
    );
}

/**
 * Builds a stable snapshot of every emitted declaration reachable from the
 * package entry point through relative imports and re-exports.
 */
export async function buildPublicApiManifest(declarationRoot, entry = 'index.d.ts') {
    const root = resolve(declarationRoot);
    const entryFile = resolve(root, entry);
    if (!isInside(root, entryFile) || !(await isFile(entryFile))) {
        throw new Error(`Public API entry declaration is missing: ${entry}`);
    }

    const pending = [entryFile];
    const modules = new Map();
    while (pending.length > 0) {
        const file = pending.pop();
        if (modules.has(file)) continue;

        const source = normalizeText(await readFile(file, 'utf8'));
        modules.set(file, {
            file,
            name: normalizeModuleName(root, file),
            source,
        });

        const references = declarationModuleSpecifiers(source);
        for (const reference of references) {
            const dependency = await resolveDeclaration(root, file, reference);
            if (dependency !== null && !modules.has(dependency)) pending.push(dependency);
        }
    }

    const ordered = [...modules.values()].sort((left, right) => {
        if (left.file === entryFile) return right.file === entryFile ? 0 : -1;
        if (right.file === entryFile) return 1;
        return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
    });

    return ordered
        .map((module) => `// Public API module: ${module.name}\n${module.source}`)
        .join('\n');
}
