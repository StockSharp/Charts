import {
    IndicatorCandleField,
    IndicatorSourceKind,
    normalizeIndicatorSource,
    type IndicatorSource,
    type IndicatorSourceStatus,
} from '../../src/index.js';

const fieldSource: IndicatorSource = {
    kind: IndicatorSourceKind.CandleField,
    field: IndicatorCandleField.Typical,
};
const outputSource: IndicatorSource = {
    kind: IndicatorSourceKind.IndicatorOutput,
    indicatorId: 'primary-rsi',
    outputId: 'line',
};
const normalized: IndicatorSource = normalizeIndicatorSource(outputSource);
const status: IndicatorSourceStatus = {
    source: fieldSource,
    available: true,
    reason: 'ready',
};
void normalized;
void status;

// @ts-expect-error candle fields are a closed trading-source set
const invalidField: IndicatorSource = { kind: 'candle-field', field: 'adjusted-close' };
void invalidField;

const untrustedSource: IndicatorSource = normalizeIndicatorSource(JSON.parse('{}'));
void untrustedSource;
