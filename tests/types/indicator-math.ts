import {
    AverageTrueRange,
    ExponentialMovingAverage,
    ExpandingAverageTrueRange,
    FixedWeightedMovingAverage,
    LinearWeightedMovingAverage,
    PartialSeedSimpleMovingAverage,
    PartialRelativeStrengthIndex,
    PartialSeedExponentialMovingAverage,
    RingBuffer,
    RollingMaximum,
    RollingLinearRegression,
    RollingMeanDeviation,
    RollingMedian,
    RollingMinimum,
    RollingStandardDeviation,
    RollingSum,
    RollingVariance,
    SimpleMovingAverage,
    TrueRange,
    WilderMovingAverage,
    type AverageTrueRangeCheckpoint,
    type ExpandingAverageTrueRangeCheckpoint,
    type PartialRelativeStrengthIndexCheckpoint,
    type PartialSeedExponentialMovingAverageCheckpoint,
    type RingBufferCheckpoint,
    type RollingWindowCheckpoint,
    type RollingLinearRegressionCheckpoint,
    type SeededMovingAverageCheckpoint,
    type TrueRangeCheckpoint,
} from '../../src/index.js';

const ring = new RingBuffer<number>(4);
ring.push(1);
const ringState: RingBufferCheckpoint<number> = ring.checkpoint();
ring.restore(ringState);

const windows = [new RollingSum(3), new RollingMinimum(3), new RollingMaximum(3)];
for (const window of windows) {
    const value: number | null = window.preview(1);
    const checkpoint: RollingWindowCheckpoint = window.checkpoint();
    window.restore(checkpoint);
    void value;
}
const partialMinimum: number | null = new RollingMinimum(3).previewPartial(1);
const partialMaximum: number | null = new RollingMaximum(3).partialValue;
void partialMinimum;
void partialMaximum;

const statistics = [
    new RollingVariance(3),
    new RollingStandardDeviation(3, true),
    new RollingMeanDeviation(3),
    new RollingMedian(3),
];
for (const statistic of statistics) statistic.push(1);

const regression = new RollingLinearRegression(3);
const regressionState: RollingLinearRegressionCheckpoint = regression.checkpoint();
regression.restore(regressionState);
const nextRegression: number | null = regression.nextValue;
const previewNextRegression: number | null = regression.previewNext(1);
const slopeRegression: number | null = regression.slopeValue;
const previewSlopeRegression: number | null = regression.previewSlope(1);
const standardErrorRegression: number | null = regression.standardErrorValue;
const previewStandardErrorRegression: number | null = regression.previewStandardError(1);
const rSquaredRegression: number | null = regression.rSquaredValue;
const previewRSquaredRegression: number | null = regression.previewRSquared(1);
void nextRegression;
void rSquaredRegression;
void previewRSquaredRegression;
void previewNextRegression;
void slopeRegression;
void previewSlopeRegression;
void standardErrorRegression;
void previewStandardErrorRegression;

const ema = new ExponentialMovingAverage(3);
const averages = [
    new SimpleMovingAverage(3),
    new LinearWeightedMovingAverage(3),
    new PartialSeedSimpleMovingAverage(3),
    new FixedWeightedMovingAverage([1, 2, 3]),
    ema,
    new WilderMovingAverage(3),
];
for (const average of averages) average.push(1);
const emaState: SeededMovingAverageCheckpoint = ema.checkpoint();
void emaState;

const partialRsi = new PartialRelativeStrengthIndex(14);
const partialRsiState: PartialRelativeStrengthIndexCheckpoint = partialRsi.checkpoint();
partialRsi.restore(partialRsiState);

const partialEma = new PartialSeedExponentialMovingAverage(14);
const partialEmaState: PartialSeedExponentialMovingAverageCheckpoint = partialEma.checkpoint();
partialEma.restore(partialEmaState);

const range = new TrueRange();
range.push({ time: 1, open: 1, high: 2, low: 0, close: 1 });
const rangeState: TrueRangeCheckpoint = range.checkpoint();
range.restore(rangeState);

const atr = new AverageTrueRange(14);
const atrState: AverageTrueRangeCheckpoint = atr.checkpoint();
atr.restore(atrState);

const expandingAtr = new ExpandingAverageTrueRange(14);
const expandingAtrState: ExpandingAverageTrueRangeCheckpoint = expandingAtr.checkpoint();
expandingAtr.restore(expandingAtrState);
