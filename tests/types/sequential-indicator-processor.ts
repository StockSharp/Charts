import {
    SequentialIndicatorProcessor,
    type IndicatorCalculationResult,
    type IndicatorOutputMetadata,
    type IndicatorOutputMetadataValue,
    type IndicatorProcessInput,
    type SequentialIndicatorCheckpoint,
} from '../../src/index.js';

interface State { readonly sum: number }

class SumProcessor extends SequentialIndicatorProcessor<number, State> {
    private sum = 0;
    constructor() { super(['value']); }
    protected calculate(
        input: IndicatorProcessInput<number>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const value = this.sum + input.value;
        if (commit) this.sum = value;
        const metadata: IndicatorOutputMetadata = { up: value >= 0, label: 'sum' };
        return {
            isFormed: true,
            values: [this.output('value', value, input.index, metadata)],
        };
    }
    protected resetState(): void { this.sum = 0; }
    protected captureState(): State { return { sum: this.sum }; }
    protected restoreState(state: State): void { this.sum = state.sum; }
}

const processor = new SumProcessor();
const result = processor.process({ index: 0, time: 1, value: 2, isFinal: false });
const checkpoint: SequentialIndicatorCheckpoint<State> = processor.checkpoint();
processor.restore(checkpoint);
const value: number | null = result.values[0].value;
const metadataValue: IndicatorOutputMetadataValue | undefined
    = result.values[0].metadata?.up;
void value;
void metadataValue;
