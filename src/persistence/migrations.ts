import { CHART_STATE_SCHEMA_VERSION } from './chart-state.js';

export type RawChartState = Readonly<Record<string, unknown>>;
export type ChartStateMigration = (state: RawChartState) => RawChartState;

export class ChartStateMigrationRegistry {
    private readonly migrations = new Map<number, ChartStateMigration>();

    register(fromVersion: number, migration: ChartStateMigration): void {
        if (!Number.isSafeInteger(fromVersion) || fromVersion < 0)
            throw new RangeError('sschart: chart state migration version must be non-negative');
        if (typeof migration !== 'function')
            throw new TypeError('sschart: chart state migration must be a function');
        if (this.migrations.has(fromVersion))
            throw new Error(`sschart: chart state migration v${fromVersion} -> v${fromVersion + 1} already exists`);
        this.migrations.set(fromVersion, migration);
    }

    migrate(value: unknown, targetVersion = CHART_STATE_SCHEMA_VERSION): RawChartState {
        if (!Number.isSafeInteger(targetVersion) || targetVersion < 0)
            throw new RangeError('sschart: chart state target version must be non-negative');
        let state = rawState(value);
        let version = versionOf(state);
        if (version > targetVersion)
            throw new RangeError(`sschart: chart state v${version} is newer than supported v${targetVersion}`);
        while (version < targetVersion) {
            const migration = this.migrations.get(version);
            if (migration === undefined)
                throw new Error(`sschart: no chart state migration v${version} -> v${version + 1}`);
            state = rawState(migration(state));
            const next = versionOf(state);
            if (next !== version + 1) {
                throw new Error(
                    `sschart: chart state migration v${version} must produce schemaVersion ${version + 1}`,
                );
            }
            version = next;
        }
        return state;
    }
}

export const chartStateMigrations = new ChartStateMigrationRegistry();

chartStateMigrations.register(0, state => Object.freeze({
    schemaVersion: 1,
    chartOptions: state.options ?? {},
    panes: state.panes ?? [],
    series: state.series ?? [],
    indicators: state.studies ?? [],
    drawings: state.drawings ?? [],
}));

function rawState(value: unknown): RawChartState {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError('sschart: chart state migration input must be an object');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError('sschart: chart state migration input must be a plain object');
    return value as RawChartState;
}

function versionOf(value: RawChartState): number {
    if (!Number.isSafeInteger(value.schemaVersion) || (value.schemaVersion as number) < 0)
        throw new RangeError('sschart: chart state schemaVersion must be a non-negative integer');
    return value.schemaVersion as number;
}
