import {
    CHART_STATE_SCHEMA_VERSION,
    normalizeChartStateV1,
    type ChartStateV1,
} from './chart-state.js';
import {
    chartStateMigrations,
    type ChartStateMigrationRegistry,
} from './migrations.js';

export interface SerializeChartStateOptions {
    readonly pretty?: boolean;
}

export interface DeserializeChartStateOptions {
    readonly migrations?: ChartStateMigrationRegistry;
}

export function serializeChartState(
    state: ChartStateV1,
    options: SerializeChartStateOptions = {},
): string {
    if (options === null || typeof options !== 'object')
        throw new TypeError('sschart: chart state serialization options must be an object');
    if (options.pretty !== undefined && typeof options.pretty !== 'boolean')
        throw new TypeError('sschart: chart state pretty option must be boolean');
    const normalized = normalizeChartStateV1(state);
    return JSON.stringify(normalized, null, options.pretty === true ? 2 : undefined);
}

export function deserializeChartState(
    value: string | unknown,
    options: DeserializeChartStateOptions = {},
): ChartStateV1 {
    if (options === null || typeof options !== 'object')
        throw new TypeError('sschart: chart state deserialization options must be an object');
    let parsed = value;
    if (typeof value === 'string') {
        try { parsed = JSON.parse(value); }
        catch (error) {
            throw new SyntaxError(
                `sschart: invalid chart state JSON: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
    const migrated = (options.migrations ?? chartStateMigrations).migrate(
        parsed,
        CHART_STATE_SCHEMA_VERSION,
    );
    return normalizeChartStateV1(migrated);
}
