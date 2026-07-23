import {
    FootprintApproximation,
    FootprintAggregator,
    FootprintDisplayMode,
    FootprintSeries,
    ExactVolumeProfileSeries,
    TpoDisplayMode,
    TpoSeries,
    VolumeProfileStatus,
    VolumeProfileDisplayMode,
    VolumeProfileRangeMode,
    calculateDevelopingVolumeProfile,
    calculateVolumeProfile,
    resolveVolumeProfile,
    OrderFlowDataMode,
    TradeAggressorSide,
    calculateFootprintMetrics,
    footprintBarVolume,
    isExactFootprintBar,
    normalizeApproximateFootprintBar,
    normalizeFootprintBar,
    normalizeOrderFlowTrade,
    type ApproximateFootprintBar,
    type FootprintBar,
    type IChartApi,
    type TpoBar,
    type OrderFlowBar,
} from '../../src/index.js';

const exact: FootprintBar = {
    dataMode: OrderFlowDataMode.Exact,
    time: 1,
    open: 10,
    high: 11,
    low: 9,
    close: 10,
    levels: [{ price: 10, bidVolume: 3, askVolume: 5 }],
};
const approximate: ApproximateFootprintBar = {
    dataMode: OrderFlowDataMode.Approximate,
    approximation: FootprintApproximation.UnclassifiedTrades,
    time: 2,
    open: 10,
    high: 11,
    low: 9,
    close: 10,
    levels: [{ price: 10, totalVolume: 8 }],
};
const union: OrderFlowBar = Math.random() > 0.5 ? exact : approximate;
if (isExactFootprintBar(union)) void footprintBarVolume(union);
void normalizeFootprintBar(exact, { tickSize: 1 });
void normalizeApproximateFootprintBar(approximate, { tickSize: 1 });
void normalizeOrderFlowTrade({
    time: 1,
    price: 10,
    volume: 1,
    aggressorSide: TradeAggressorSide.Buy,
}, { tickSize: 1 });
const aggregator = new FootprintAggregator({ tickSize: 1, barDuration: 60 });
const aggregationPatch = aggregator.push({
    time: 60,
    price: 10,
    volume: 2,
    aggressorSide: TradeAggressorSide.Sell,
});
const aggregated: FootprintBar | undefined = aggregationPatch.data[0];
void aggregated;
const metrics = calculateFootprintMetrics(exact, {
    tickSize: 1,
    valueAreaPercentage: 0.7,
    imbalanceRatio: 3,
    stackedImbalanceCount: 3,
});
const exactDelta: number = metrics.delta;
const poc: number = metrics.pocPrice;
void exactDelta;
void poc;

declare const footprintChart: IChartApi;
const footprintSeries = footprintChart.addSeries(FootprintSeries, {
    tickSize: 1,
    mode: FootprintDisplayMode.Delta,
    imbalanceRatio: 4,
});
footprintSeries.setData([exact]);
footprintSeries.update({ ...exact, time: 2 });
footprintSeries.applyOptions({ mode: FootprintDisplayMode.Ladder });
// @ts-expect-error the exact footprint series does not accept approximate bars
footprintSeries.update(approximate);
// @ts-expect-error display mode is a closed contract
footprintSeries.applyOptions({ mode: 'invented-mode' });

const profile = calculateVolumeProfile([exact], { tickSize: 1 });
if (profile.status === VolumeProfileStatus.Ready) {
    const profilePoc: number = profile.pocPrice;
    void profilePoc;
}
void calculateDevelopingVolumeProfile([exact], { tickSize: 1 });
const unavailableProfile = resolveVolumeProfile([approximate], { tickSize: 1 });
if (unavailableProfile.status === VolumeProfileStatus.Approximate)
    void unavailableProfile.approximations;

const profileSeries = footprintChart.addSeries(ExactVolumeProfileSeries, {
    tickSize: 1,
    rangeMode: VolumeProfileRangeMode.Fixed,
    fixedRange: { from: 1, to: 2 },
    displayMode: VolumeProfileDisplayMode.BidAsk,
    showDevelopingLevels: true,
});
profileSeries.setData([exact]);
profileSeries.applyOptions({ rangeMode: VolumeProfileRangeMode.Visible });
// @ts-expect-error legacy approximate bars cannot enter the exact profile series
profileSeries.update(approximate);

const tpoBar: TpoBar = {
    time: 1,
    sessionId: '2026-07-22',
    open: 10,
    high: 11,
    low: 9,
    close: 10,
};
const tpoSeries = footprintChart.addSeries(TpoSeries, {
    tickSize: 1,
    displayMode: TpoDisplayMode.Letters,
    initialBalancePeriods: 2,
});
tpoSeries.setData([tpoBar]);
// @ts-expect-error TPO input requires an explicit serializable session identity
tpoSeries.update(exact);

// @ts-expect-error approximate levels cannot enter the exact footprint contract
const notExact: FootprintBar = approximate;
const missingAsk: FootprintBar = {
    ...exact,
    // @ts-expect-error exact levels require the aggressor-side split
    levels: [{ price: 10, bidVolume: 8 }],
};
void notExact;
void missingAsk;
