export type IndicatorCatalogMaybePromise<T> = T | Promise<T>;

export interface IndicatorCatalogEntry {
    readonly id: string;
    readonly name: string;
    readonly fullName: string;
    /** Stable category id, for example `support-resistance`. */
    readonly category: string;
    /** User-facing category label, for example `Support & Resistance`. */
    readonly categoryLabel: string;
    readonly aliases?: readonly string[];
}

export interface IndicatorCatalogQuery {
    readonly text?: string;
    /** Matches either the stable category id or its label. */
    readonly category?: string;
    readonly favoritesOnly?: boolean;
}

/** Host-owned preference storage. The host decides scope and storage technology. */
export interface IndicatorFavoritesStorage {
    load(): IndicatorCatalogMaybePromise<readonly string[] | null>;
    save(indicatorIds: readonly string[]): IndicatorCatalogMaybePromise<void>;
}

export interface IndicatorCatalogControllerOptions {
    readonly entries: readonly IndicatorCatalogEntry[];
    readonly favorites?: readonly string[];
    readonly storage?: IndicatorFavoritesStorage;
}

export interface IndicatorCatalogSnapshot {
    readonly favorites: readonly string[];
    readonly loaded: boolean;
}

export type IndicatorCatalogListener = (snapshot: IndicatorCatalogSnapshot) => void;

interface IndexedEntry {
    readonly entry: IndicatorCatalogEntry;
    readonly searchText: string;
    readonly category: string;
    readonly categoryLabel: string;
}

/** Searchable indicator catalog with host-persisted, catalog-scoped favorites. */
export class IndicatorCatalogController {
    private readonly indexed: readonly IndexedEntry[];
    private readonly byId: ReadonlyMap<string, IndicatorCatalogEntry>;
    private readonly favoriteIds = new Set<string>();
    private readonly listeners = new Set<IndicatorCatalogListener>();
    private readonly storage?: IndicatorFavoritesStorage;
    private loadPromise: Promise<readonly string[]> | null = null;
    private saveTail: Promise<void> = Promise.resolve();
    private loadingOverrides: Map<string, boolean> | null = null;
    private loaded: boolean;

    constructor(options: IndicatorCatalogControllerOptions) {
        if (options === null || typeof options !== 'object')
            throw new TypeError('sschart: indicator catalog options are required');
        if (!Array.isArray(options.entries))
            throw new TypeError('sschart: indicator catalog entries must be an array');
        if (options.storage !== undefined) validateStorage(options.storage);

        const byId = new Map<string, IndicatorCatalogEntry>();
        const indexed = options.entries.map((value, index) => {
            const entry = normalizeEntry(value, index);
            if (byId.has(entry.id))
                throw new TypeError(`sschart: duplicate indicator catalog id '${entry.id}'`);
            byId.set(entry.id, entry);
            return Object.freeze({
                entry,
                searchText: normalizeText([
                    entry.id,
                    entry.name,
                    entry.fullName,
                    entry.category,
                    entry.categoryLabel,
                    ...(entry.aliases ?? []),
                ].join(' ')),
                category: normalizeText(entry.category),
                categoryLabel: normalizeText(entry.categoryLabel),
            });
        });
        this.indexed = Object.freeze(indexed);
        this.byId = byId;
        this.storage = options.storage;
        this.loaded = options.storage === undefined;
        this.replaceFavorites(options.favorites ?? [], 'initial favorites');
    }

    entries(): readonly IndicatorCatalogEntry[] {
        return Object.freeze(this.indexed.map(item => item.entry));
    }

    search(query: IndicatorCatalogQuery = {}): readonly IndicatorCatalogEntry[] {
        if (query === null || typeof query !== 'object')
            throw new TypeError('sschart: indicator catalog query must be an object');
        if (query.text !== undefined && typeof query.text !== 'string')
            throw new TypeError('sschart: indicator catalog query text must be a string');
        if (query.category !== undefined && typeof query.category !== 'string')
            throw new TypeError('sschart: indicator catalog query category must be a string');
        if (query.favoritesOnly !== undefined && typeof query.favoritesOnly !== 'boolean')
            throw new TypeError('sschart: indicator catalog favoritesOnly must be boolean');

        const tokens = normalizeText(query.text ?? '').split(/\s+/u).filter(Boolean);
        const category = normalizeText(query.category ?? '');
        return Object.freeze(this.indexed
            .filter(item => !query.favoritesOnly || this.favoriteIds.has(item.entry.id))
            .filter(item => !category
                || item.category === category
                || item.categoryLabel === category)
            .filter(item => tokens.every(token => item.searchText.includes(token)))
            .map(item => item.entry));
    }

    isFavorite(indicatorId: string): boolean {
        return this.favoriteIds.has(this.requireId(indicatorId));
    }

    favorites(): readonly string[] {
        return Object.freeze(this.indexed
            .map(item => item.entry.id)
            .filter(id => this.favoriteIds.has(id)));
    }

    snapshot(): IndicatorCatalogSnapshot {
        return Object.freeze({ favorites: this.favorites(), loaded: this.loaded });
    }

    subscribe(listener: IndicatorCatalogListener): void {
        if (typeof listener !== 'function')
            throw new TypeError('sschart: indicator catalog listener must be a function');
        this.listeners.add(listener);
    }

    unsubscribe(listener: IndicatorCatalogListener): void {
        this.listeners.delete(listener);
    }

    loadFavorites(): Promise<readonly string[]> {
        if (!this.storage) return Promise.resolve(this.favorites());
        if (this.loadPromise) return this.loadPromise;

        this.loadingOverrides = new Map<string, boolean>();
        let loaded: IndicatorCatalogMaybePromise<readonly string[] | null>;
        try {
            loaded = this.storage.load();
        } catch (error) {
            this.loadingOverrides = null;
            return Promise.reject(error);
        }
        this.loadPromise = Promise.resolve(loaded).then((ids) => {
            const restored = this.normalizeFavoriteIds(ids, 'stored favorites');
            for (const [id, favorite] of this.loadingOverrides ?? []) {
                if (favorite) restored.add(id);
                else restored.delete(id);
            }
            this.loadingOverrides = null;
            this.favoriteIds.clear();
            for (const id of restored) this.favoriteIds.add(id);
            this.loaded = true;
            this.emit();
            return this.favorites();
        }).catch((error) => {
            this.loadingOverrides = null;
            this.loadPromise = null;
            throw error;
        });
        return this.loadPromise;
    }

    setFavorite(indicatorId: string, favorite: boolean): Promise<void> {
        const id = this.requireId(indicatorId);
        if (typeof favorite !== 'boolean')
            throw new TypeError('sschart: indicator favorite state must be boolean');
        const loadPending = this.storage !== undefined && !this.loaded;
        const loading = loadPending ? this.loadFavorites() : this.loadPromise;
        const changed = this.favoriteIds.has(id) !== favorite;
        if (changed && favorite) this.favoriteIds.add(id);
        else if (changed) this.favoriteIds.delete(id);
        this.loadingOverrides?.set(id, favorite);
        if (!changed && !loadPending) return Promise.resolve();
        if (changed) this.emit();
        return this.persist(loading);
    }

    toggleFavorite(indicatorId: string): Promise<boolean> {
        const id = this.requireId(indicatorId);
        const favorite = !this.favoriteIds.has(id);
        return this.setFavorite(id, favorite).then(() => favorite);
    }

    private requireId(value: string): string {
        if (typeof value !== 'string' || value.trim().length === 0)
            throw new TypeError('sschart: indicator catalog id must be a non-empty string');
        const id = value.trim();
        if (!this.byId.has(id))
            throw new RangeError(`sschart: unknown indicator catalog id '${id}'`);
        return id;
    }

    private replaceFavorites(values: readonly string[], name: string): void {
        const next = this.normalizeFavoriteIds(values, name);
        this.favoriteIds.clear();
        for (const id of next) this.favoriteIds.add(id);
    }

    private normalizeFavoriteIds(
        values: readonly string[] | null,
        name: string,
    ): Set<string> {
        if (values === null) return new Set<string>();
        if (!Array.isArray(values) || values.some(value => typeof value !== 'string'))
            throw new TypeError(`sschart: indicator catalog ${name} must be an array of ids`);
        return new Set(values.map(value => value.trim()).filter(id => this.byId.has(id)));
    }

    private persist(loading: Promise<readonly string[]> | null = this.loadPromise): Promise<void> {
        if (!this.storage) return Promise.resolve();
        const waitForLoad = loading ?? Promise.resolve(this.favorites());
        const save = async (): Promise<void> => {
            await waitForLoad;
            await this.storage!.save(this.favorites());
        };
        this.saveTail = this.saveTail.then(save, save);
        return this.saveTail;
    }

    private emit(): void {
        const snapshot = this.snapshot();
        for (const listener of this.listeners) listener(snapshot);
    }
}

function normalizeEntry(value: IndicatorCatalogEntry, index: number): IndicatorCatalogEntry {
    if (value === null || typeof value !== 'object')
        throw new TypeError(`sschart: indicator catalog entry ${index} must be an object`);
    const id = requiredText(value.id, `entry ${index} id`);
    const name = requiredText(value.name, `entry '${id}' name`);
    const fullName = requiredText(value.fullName, `entry '${id}' fullName`);
    const category = requiredText(value.category, `entry '${id}' category`);
    const categoryLabel = requiredText(value.categoryLabel, `entry '${id}' categoryLabel`);
    if (value.aliases !== undefined && !Array.isArray(value.aliases))
        throw new TypeError(`sschart: indicator catalog entry '${id}' aliases must be an array`);
    const aliases = Object.freeze([...new Set((value.aliases ?? []).map((alias) => (
        requiredText(alias, `entry '${id}' alias`)
    )))]) as readonly string[];
    return Object.freeze({ id, name, fullName, category, categoryLabel, aliases });
}

function requiredText(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: indicator catalog ${name} must be a non-empty string`);
    return value.trim();
}

function normalizeText(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase();
}

function validateStorage(value: IndicatorFavoritesStorage): void {
    if (value === null || typeof value !== 'object'
        || typeof value.load !== 'function' || typeof value.save !== 'function') {
        throw new TypeError('sschart: indicator favorites storage is invalid');
    }
}
