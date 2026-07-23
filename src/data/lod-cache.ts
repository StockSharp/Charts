export interface LodCacheKey {
    readonly symbol: string;
    readonly resolution: string;
    readonly groupingLevel: number;
}

export interface LodCacheSnapshot {
    readonly size: number;
    readonly capacity: number;
    readonly hits: number;
    readonly misses: number;
    readonly keys: readonly LodCacheKey[];
}

interface LodCacheEntry<TValue> {
    readonly key: LodCacheKey;
    readonly sourceVersion: number;
    readonly value: TValue;
}

/** Bounded LRU for derived views. Raw-data version is part of entry validity. */
export class LodCache<TValue extends {}> {
    private readonly entries = new Map<string, LodCacheEntry<TValue>>();
    private hitCount = 0;
    private missCount = 0;

    constructor(private readonly maxEntries = 8) {
        if (!Number.isInteger(maxEntries) || maxEntries < 1)
            throw new RangeError('sschart: LOD cache capacity must be a positive integer');
    }

    get(key: LodCacheKey, sourceVersion: number): TValue | undefined {
        const normalized = normalizeKey(key);
        const version = validVersion(sourceVersion);
        const id = cacheId(normalized);
        const entry = this.entries.get(id);
        if (entry === undefined || entry.sourceVersion !== version) {
            if (entry !== undefined) this.entries.delete(id);
            this.missCount++;
            return undefined;
        }
        this.entries.delete(id);
        this.entries.set(id, entry);
        this.hitCount++;
        return entry.value;
    }

    set(key: LodCacheKey, sourceVersion: number, value: TValue): void {
        if (value === null || value === undefined)
            throw new TypeError('sschart: LOD cache value cannot be null or undefined');
        const normalized = normalizeKey(key);
        const id = cacheId(normalized);
        this.entries.delete(id);
        this.entries.set(id, Object.freeze({
            key: normalized,
            sourceVersion: validVersion(sourceVersion),
            value,
        }));
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next().value as string | undefined;
            if (oldest === undefined) break;
            this.entries.delete(oldest);
        }
    }

    getOrCreate(
        key: LodCacheKey,
        sourceVersion: number,
        factory: () => TValue,
    ): TValue {
        const cached = this.get(key, sourceVersion);
        if (cached !== undefined) return cached;
        const value = factory();
        this.set(key, sourceVersion, value);
        return value;
    }

    invalidateExceptVersion(sourceVersion: number): void {
        const version = validVersion(sourceVersion);
        for (const [id, entry] of this.entries) {
            if (entry.sourceVersion !== version) this.entries.delete(id);
        }
    }

    clear(): void { this.entries.clear(); }

    snapshot(): LodCacheSnapshot {
        return Object.freeze({
            size: this.entries.size,
            capacity: this.maxEntries,
            hits: this.hitCount,
            misses: this.missCount,
            keys: Object.freeze([...this.entries.values()].map((entry) => entry.key)),
        });
    }
}

function normalizeKey(key: LodCacheKey): LodCacheKey {
    if (key === null || typeof key !== 'object')
        throw new TypeError('sschart: LOD cache key is required');
    if (typeof key.symbol !== 'string' || key.symbol.trim().length === 0)
        throw new TypeError('sschart: LOD cache symbol must be a non-empty string');
    if (typeof key.resolution !== 'string' || key.resolution.trim().length === 0)
        throw new TypeError('sschart: LOD cache resolution must be a non-empty string');
    if (!Number.isInteger(key.groupingLevel) || key.groupingLevel < 1)
        throw new RangeError('sschart: LOD cache groupingLevel must be a positive integer');
    return Object.freeze({
        symbol: key.symbol.trim(),
        resolution: key.resolution.trim(),
        groupingLevel: key.groupingLevel,
    });
}

function validVersion(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new RangeError('sschart: LOD cache sourceVersion must be a non-negative safe integer');
    return value;
}

function cacheId(key: LodCacheKey): string {
    return JSON.stringify([key.symbol, key.resolution, key.groupingLevel]);
}
