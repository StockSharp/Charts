const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { SequentialIndicatorProcessor } = require('../src/indicators/index.js');

class SumProcessor extends SequentialIndicatorProcessor {
    constructor() {
        super(['value', 'signal']);
        this.sum = 0;
    }

    calculate(input, commit) {
        const next = this.sum + input.value;
        if (commit) this.sum = next;
        return {
            isFormed: input.index > 0,
            values: [
                this.output('value', next, input.index),
                this.output('signal', next > 5 ? 1 : null, Math.max(0, input.index - 1)),
            ],
        };
    }

    resetState() { this.sum = 0; }
    captureState() { return Object.freeze({ sum: this.sum }); }
    restoreState(state) {
        if (state === null || typeof state !== 'object' || !Number.isFinite(state.sum))
            throw new TypeError('invalid sum state');
        this.sum = state.sum;
    }
}

class MetadataProcessor extends SequentialIndicatorProcessor {
    constructor(metadata) {
        super(['value']);
        this.metadata = metadata;
    }
    calculate(input) {
        return {
            isFormed: true,
            values: [this.output('value', Math.abs(input.value), input.index, this.metadata)],
        };
    }
    resetState() {}
    captureState() { return Object.freeze({}); }
    restoreState() {}
}

function input(index, value, isFinal) {
    return { index, time: 1_000 + index, value, isFinal };
}

describe('SequentialIndicatorProcessor', () => {
    it('previews repeatedly from committed state and advances only on final input', () => {
        const processor = new SumProcessor();
        const firstPreview = processor.process(input(0, 2, false));
        const secondPreview = processor.process(input(0, 5, false));

        assert.equal(processor.position, 0);
        assert.equal(firstPreview.values[0].value, 2);
        assert.equal(secondPreview.values[0].value, 5);
        assert.equal(processor.process(input(0, 3, true)).values[0].value, 3);
        assert.equal(processor.position, 1);
        assert.equal(processor.process(input(1, 4, false)).values[0].value, 7);
        assert.equal(processor.position, 1);
        assert.equal(processor.process(input(1, 4, true)).values[0].value, 7);
        assert.equal(processor.position, 2);
    });

    it('restores versioned checkpoints and immutable target-index output', () => {
        const processor = new SumProcessor();
        processor.process(input(0, 2, true));
        const checkpoint = processor.checkpoint();
        const result = processor.process(input(1, 6, true));

        assert.equal(result.sourceIndex, 1);
        assert.equal(result.isFormed, true);
        assert.deepEqual(result.values, [
            { outputId: 'value', value: 8, targetIndex: 1 },
            { outputId: 'signal', value: 1, targetIndex: 0 },
        ]);
        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.isFrozen(result.values), true);
        assert.equal(Object.isFrozen(result.values[0]), true);

        processor.restore(checkpoint);
        assert.equal(processor.position, 1);
        assert.equal(processor.process(input(1, 1, true)).values[0].value, 3);
        processor.reset();
        assert.equal(processor.position, 0);
        assert.equal(processor.process(input(0, 1, false)).values[0].value, 1);
    });

    it('rejects gaps, malformed values and undeclared or duplicate outputs', () => {
        const processor = new SumProcessor();
        assert.throws(() => processor.process(input(1, 1, true)), /expected input index 0/);
        assert.throws(() => processor.process({ ...input(0, 1, true), time: Number.NaN }), /time must be finite/);
        assert.equal(processor.position, 0);

        class InvalidProcessor extends SumProcessor {
            calculate() {
                return {
                    isFormed: true,
                    values: [{ outputId: 'missing', value: 1, targetIndex: 0 }],
                };
            }
        }
        assert.throws(() => new InvalidProcessor().process(input(0, 1, false)), /unknown output/);

        class DuplicateProcessor extends SumProcessor {
            calculate() {
                return {
                    isFormed: true,
                    values: [
                        { outputId: 'value', value: 1, targetIndex: 0 },
                        { outputId: 'value', value: 2, targetIndex: 0 },
                    ],
                };
            }
        }
        assert.throws(() => new DuplicateProcessor().process(input(0, 1, false)), /duplicate indicator result/);
    });

    it('owns flat immutable output metadata and rejects ambiguous painter fields', () => {
        const source = { up: true, label: 'buy', weight: 2, optional: null };
        const result = new MetadataProcessor(source).process(input(0, -7, false));
        source.up = false;

        assert.deepEqual(result.values[0], {
            outputId: 'value',
            value: 7,
            targetIndex: 0,
            metadata: { up: true, label: 'buy', weight: 2, optional: null },
        });
        assert.equal(Object.isFrozen(result.values[0].metadata), true);

        assert.throws(
            () => new MetadataProcessor([]).process(input(0, 1, false)),
            /metadata must be a flat object/,
        );
        assert.throws(
            () => new MetadataProcessor({ nested: {} }).process(input(0, 1, false)),
            /nested must be a primitive value/,
        );
        assert.throws(
            () => new MetadataProcessor({ confidence: Infinity }).process(input(0, 1, false)),
            /confidence must be finite/,
        );
        assert.throws(
            () => new MetadataProcessor({ value: 1 }).process(input(0, 1, false)),
            /key 'value' is reserved/,
        );
    });

    it('rolls a failed restore back to the previous state', () => {
        const processor = new SumProcessor();
        processor.process(input(0, 4, true));
        const before = processor.checkpoint();
        assert.throws(() => processor.restore({ version: 1, position: 0, state: { sum: NaN } }), /invalid sum state/);
        assert.deepEqual(processor.checkpoint(), before);
    });
});
