import type { IndicatorPainter, IndicatorPainterFactory } from './indicator-painter.js';

const factories = new Map<string, IndicatorPainterFactory>();

function key(name: string): string {
    return String(name || '').trim().toLowerCase();
}

/**
 * Register a painter name used by catalog.json. Returns an unregister callback,
 * which is useful for plugins and tests. A factory is used so every indicator
 * gets its own painter instance and may safely keep local state.
 */
export function registerIndicatorPainter(name: string, factory: IndicatorPainterFactory): () => void {
    const normalized = key(name);
    if (!normalized) throw new Error('Indicator painter name is required.');
    if (typeof factory !== 'function') throw new Error(`Indicator painter '${name}' must be registered with a factory.`);

    const previous = factories.get(normalized);
    factories.set(normalized, factory);
    return () => {
        if (factories.get(normalized) !== factory) return;
        if (previous) factories.set(normalized, previous);
        else factories.delete(normalized);
    };
}

export function createIndicatorPainter(name?: string | null): IndicatorPainter | null {
    if (!name) return null;
    const factory = factories.get(key(name));
    return factory ? factory() : null;
}

export function hasIndicatorPainter(name: string): boolean {
    return factories.has(key(name));
}

export function getIndicatorPainterNames(): string[] {
    return Array.from(factories.keys());
}
