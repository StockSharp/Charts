const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    ExactVolumeProfileAccumulator,
    FootprintApproximation,
    FootprintPocTieBreak,
    OrderFlowDataMode,
    VolumeProfileStatus,
    calculateDevelopingVolumeProfile,
    calculateVolumeProfile,
    resolveVolumeProfile,
} = require('../src/orderflow/index.js');

const options = { tickSize: 1, valueAreaPercentage: 0.7 };

function firstBar(overrides = {}) {
    return {
        dataMode: OrderFlowDataMode.Exact,
        time: 60,
        open: 100,
        high: 102,
        low: 100,
        close: 101,
        levels: [
            { price: 100, bidVolume: 10, askVolume: 0, tradeCount: 1 },
            { price: 101, bidVolume: 5, askVolume: 15, tradeCount: 1 },
            { price: 102, bidVolume: 0, askVolume: 10, tradeCount: 1 },
        ],
        ...overrides,
    };
}

function secondBar(overrides = {}) {
    return {
        dataMode: OrderFlowDataMode.Exact,
        time: 120,
        open: 101,
        high: 103,
        low: 101,
        close: 102,
        levels: [
            { price: 101, bidVolume: 5, askVolume: 5, tradeCount: 1 },
            { price: 102, bidVolume: 20, askVolume: 0, tradeCount: 1 },
            { price: 103, bidVolume: 0, askVolume: 10, tradeCount: 1 },
        ],
        ...overrides,
    };
}

describe('exact Volume Profile', () => {
    it('aggregates only supplied footprint levels and calculates POC/value area', () => {
        const result = calculateVolumeProfile([firstBar(), secondBar()], options);

        assert.equal(result.status, VolumeProfileStatus.Ready);
        assert.deepEqual(result.levels, [
            { price: 100, bidVolume: 10, askVolume: 0, totalVolume: 10, delta: -10, tradeCount: 1 },
            { price: 101, bidVolume: 10, askVolume: 20, totalVolume: 30, delta: 10, tradeCount: 2 },
            { price: 102, bidVolume: 20, askVolume: 10, totalVolume: 30, delta: -10, tradeCount: 2 },
            { price: 103, bidVolume: 0, askVolume: 10, totalVolume: 10, delta: 10, tradeCount: 1 },
        ]);
        assert.equal(result.totalBidVolume, 40);
        assert.equal(result.totalAskVolume, 40);
        assert.equal(result.totalVolume, 80);
        assert.equal(result.delta, 0);
        assert.equal(result.tradeCount, 6);
        assert.equal(result.pocPrice, 102);
        assert.equal(result.pocVolume, 30);
        assert.deepEqual(result.valueArea, {
            low: 101,
            high: 102,
            volume: 60,
            targetVolume: 56,
            percentage: 0.7,
        });
        assert.equal(result.from, 60);
        assert.equal(result.to, 120);
        assert.equal(Object.isFrozen(result.levels), true);
    });

    it('supports deterministic POC tie-breaking', () => {
        const lower = calculateVolumeProfile([firstBar(), secondBar()], {
            ...options,
            pocTieBreak: FootprintPocTieBreak.LowerPrice,
        });
        const higher = calculateVolumeProfile([firstBar(), secondBar()], {
            ...options,
            pocTieBreak: FootprintPocTieBreak.HigherPrice,
        });

        assert.equal(lower.pocPrice, 101);
        assert.equal(higher.pocPrice, 102);
    });

    it('returns an explicit immutable empty exact profile', () => {
        const result = calculateVolumeProfile([], options);

        assert.deepEqual(result, {
            status: VolumeProfileStatus.Empty,
            dataMode: OrderFlowDataMode.Exact,
            from: null,
            to: null,
            barCount: 0,
            levels: [],
            totalBidVolume: 0,
            totalAskVolume: 0,
            totalVolume: 0,
            delta: 0,
            tradeCount: null,
            pocPrice: null,
            pocVolume: 0,
            valueArea: null,
        });
        assert.equal(Object.isFrozen(result), true);
    });
});

describe('ExactVolumeProfileAccumulator', () => {
    it('applies append and replace-last as exact level deltas', () => {
        const accumulator = new ExactVolumeProfileAccumulator(options);
        accumulator.reset([firstBar()]);
        const appended = accumulator.push(secondBar());
        const replacement = secondBar({
            close: 103,
            levels: [
                { price: 101, bidVolume: 1, askVolume: 2, tradeCount: 1 },
                { price: 103, bidVolume: 3, askVolume: 12, tradeCount: 2 },
            ],
        });
        const updated = accumulator.push(replacement);
        const batch = calculateVolumeProfile([firstBar(), replacement], options);

        assert.equal(appended.kind, 'append');
        assert.equal(updated.kind, 'update');
        assert.deepEqual(updated.profile, batch);
        assert.equal(accumulator.barCount, 2);
        assert.equal(updated.profile.levels.some(level => level.price === 102), true);
        assert.equal(
            updated.profile.levels.find(level => level.price === 102).bidVolume,
            0,
        );
    });

    it('rejects historical updates without modifying accumulated state', () => {
        const accumulator = new ExactVolumeProfileAccumulator(options);
        accumulator.reset([firstBar(), secondBar()]);
        const before = accumulator.snapshot();

        assert.throws(() => accumulator.push(firstBar()), /cannot move backwards/);
        assert.deepEqual(accumulator.snapshot(), before);
    });

    it('emits cumulative developing POC/VAH/VAL points', () => {
        const points = calculateDevelopingVolumeProfile([firstBar(), secondBar()], options);

        assert.deepEqual(points, [
            {
                time: 60,
                totalBidVolume: 15,
                totalAskVolume: 25,
                totalVolume: 40,
                delta: 10,
                pocPrice: 101,
                pocVolume: 20,
                valueAreaLow: 100,
                valueAreaHigh: 102,
            },
            {
                time: 120,
                totalBidVolume: 40,
                totalAskVolume: 40,
                totalVolume: 80,
                delta: 0,
                pocPrice: 102,
                pocVolume: 30,
                valueAreaLow: 101,
                valueAreaHigh: 102,
            },
        ]);
    });
});

describe('Volume Profile data availability', () => {
    const approximate = {
        dataMode: OrderFlowDataMode.Approximate,
        approximation: FootprintApproximation.UnclassifiedTrades,
        time: 60,
        open: 100,
        high: 102,
        low: 100,
        close: 101,
        levels: [{ price: 101, totalVolume: 40 }],
    };

    it('reports approximate data as unavailable instead of inventing a split', () => {
        const result = resolveVolumeProfile([approximate], options);

        assert.deepEqual(result, {
            status: VolumeProfileStatus.Approximate,
            inputMode: OrderFlowDataMode.Approximate,
            profile: null,
            approximations: [FootprintApproximation.UnclassifiedTrades],
            message: 'Exact volume profile is unavailable: input has no aggressor-side levels.',
        });
    });

    it('rejects mixed exact/approximate input explicitly', () => {
        const result = resolveVolumeProfile([firstBar(), { ...approximate, time: 120 }], options);

        assert.equal(result.status, VolumeProfileStatus.Mixed);
        assert.equal(result.inputMode, 'mixed');
        assert.equal(result.profile, null);
    });

    it('validates time ordering and calculation policy', () => {
        assert.throws(
            () => calculateVolumeProfile([secondBar(), firstBar()], options),
            /strictly increasing/,
        );
        assert.throws(
            () => calculateVolumeProfile([], { tickSize: 1, valueAreaPercentage: 2 }),
            /valueAreaPercentage/,
        );
    });
});
