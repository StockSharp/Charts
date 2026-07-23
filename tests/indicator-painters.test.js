const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.SSChart = {
    LineSeries: { type: 'Line' },
    HistogramSeries: { type: 'Histogram' },
    AreaSeries: { type: 'Area' },
    BandSeries: { type: 'Band' },
};

const { IndicatorRenderer } = require('../src/chart/indicators/indicator-renderer.js');
const { IndicatorEngine } = require('../src/chart/indicators/indicator-engine.js');
const { getClientCatalog } = require('../src/chart/indicators/calc/index.js');
const { getIndicatorDefinitions } = require('../src/indicators/index.js');
const {
    hasIndicatorPainter,
    registerIndicatorPainter,
} = require('../src/chart/indicators/painters/index.js');

function chartMock() {
    return {
        added: [],
        removed: [],
        addSeries(definition, options) {
            const series = {
                definition,
                options,
                data: null,
                setDataCalls: 0,
                updateCalls: 0,
                popCalls: 0,
                levels: [],
                setData(data) { this.data = [...data]; this.setDataCalls++; },
                update(point) {
                    this.updateCalls++;
                    if (!Array.isArray(this.data)) this.data = [];
                    const last = this.data[this.data.length - 1];
                    if (last?.time === point.time) this.data[this.data.length - 1] = point;
                    else if (!last || last.time < point.time) this.data.push(point);
                },
                pop(count = 1) {
                    this.popCalls++;
                    return this.data.splice(Math.max(0, this.data.length - count), count);
                },
                createPriceLine(options) { this.levels.push(options); },
            };
            this.added.push(series);
            return series;
        },
        removeSeries(series) { this.removed.push(series); },
    };
}

describe('indicator painters', () => {
    it('forwards incremental output metadata to painter data points', () => {
        const engine = new IndicatorEngine();
        const data = engine._runtimeRendererShape({ outputNames: ['value'] }, [{
            outputId: 'value',
            sourceIndex: 0,
            targetIndex: 0,
            time: 10,
            value: 25,
            metadata: { up: false, color: '#123456' },
        }]);

        assert.deepEqual(data, {
            value: [{ time: 10, value: 25, up: false, color: '#123456' }],
        });
    });

    it('uses plain lines when the catalog has no painter', () => {
        const chart = chartMock();
        const renderer = new IndicatorRenderer(chart);
        const first = [{ time: 1, value: 10 }];
        const second = [{ time: 2, value: 11 }];
        const entry = { type: 'SimpleMovingAverage', outputNames: ['value'], seriesRefs: [] };
        const settings = { name: 'SMA' };

        entry.seriesRefs = renderer.render(entry, first, null, settings);
        assert.equal(chart.added.length, 1);
        assert.equal(chart.added[0].definition.type, 'Line');
        assert.deepEqual(chart.added[0].data, first);

        renderer.update(entry, second, null, settings);
        assert.deepEqual(chart.added[0].data, second);
    });

    it('streams migrated indicators without a full painter setData pass', async () => {
        const chart = chartMock();
        const renderer = new IndicatorRenderer(chart);
        const engine = new IndicatorEngine();
        const candles = Array.from({ length: 40 }, (_, index) => ({
            time: 1_700_000_000 + index * 60,
            open: index === 20 ? 91 : 100 + index,
            high: index === 20 ? 92 : 102 + index,
            low: index === 20 ? 89 : 99 + index,
            close: index === 20 ? 90 : 101 + index,
            volume: 1_000 + index,
        }));
        engine.setRenderer(renderer);
        engine.setCandles(candles);
        const entries = [
            engine.add('SimpleMovingAverage', { length: 7 }, '__main__'),
            engine.add('ExponentialMovingAverage', { length: 7 }, '__main__'),
            engine.add('AverageTrueRange', { length: 7 }, '__main__'),
            engine.add('RelativeStrengthIndex', { length: 7 }, '__main__'),
            engine.add('Momentum', { length: 5 }, '__main__'),
            engine.add('MoneyFlowIndex', { length: 7 }, '__main__'),
            engine.add('OnBalanceVolume', {}, '__main__'),
            engine.add('BollingerBands', { length: 7, stdDev: 2 }, '__main__'),
            engine.add('MovingAverageConvergenceDivergence', {
                fastLength: 4, slowLength: 8, signalLength: 3,
            }, '__main__'),
            engine.add('StochasticOscillator', {
                kPeriod: 7, dPeriod: 3, smooth: 2,
            }, '__main__'),
            engine.add('AverageDirectionalIndex', { length: 7 }, '__main__'),
            engine.add('CommodityChannelIndex', { length: 7 }, '__main__'),
            engine.add('Ichimoku', { tenkan: 4, kijun: 7, senkouB: 12 }, '__main__'),
            engine.add('TimeWeightedAveragePrice', {}, '__main__'),
            engine.add('VolumeWeightedAveragePrice', {}, '__main__'),
            engine.add('ParabolicSar', {
                acceleration: 0.02, accelerationStep: 0.02, accelerationMax: 0.2,
            }, '__main__'),
            engine.add('KaufmanAdaptiveMovingAverage', {
                length: 7, fastSc: 2, slowSc: 20,
            }, '__main__'),
            engine.add('KaufmanEfficiencyRatio', { length: 7 }, '__main__'),
            engine.add('FractalAdaptiveMovingAverage', { length: 9 }, '__main__'),
            engine.add('WeightedMovingAverage', { length: 7 }, '__main__'),
            engine.add('SmoothedMovingAverage', { length: 7 }, '__main__'),
            engine.add('WilderMovingAverage', { length: 7 }, '__main__'),
            engine.add('VolumeWeightedMovingAverage', { length: 7 }, '__main__'),
            engine.add('DoubleExponentialMovingAverage', { length: 5 }, '__main__'),
            engine.add('TripleExponentialMovingAverage', { length: 5 }, '__main__'),
            engine.add('HullMovingAverage', { length: 9, sqrtPeriod: 3 }, '__main__'),
            engine.add('Alligator', {
                jawLength: 5, jawShift: 3,
                teethLength: 4, teethShift: 2,
                lipsLength: 3, lipsShift: 1,
            }, '__main__'),
            engine.add('GatorOscillator', {
                jawLength: 5, jawShift: 0,
                teethLength: 4, teethShift: 1,
                lipsLength: 3, lipsShift: 0,
            }, '__main__'),
            engine.add('TrueRange', {}, '__main__'),
            engine.add('StandardDeviation', { length: 7 }, '__main__'),
            engine.add('Sum', { length: 7 }, '__main__'),
            engine.add('Highest', { length: 7 }, '__main__'),
            engine.add('Lowest', { length: 7 }, '__main__'),
            engine.add('VolumeIndicator', {}, '__main__'),
            engine.add('WilliamsR', { length: 7 }, '__main__'),
            engine.add('Envelope', { length: 7, percent: 2.5 }, '__main__'),
            engine.add('AwesomeOscillator', { shortLength: 3, longLength: 9 }, '__main__'),
            engine.add('Aroon', { length: 7 }, '__main__'),
            engine.add('AroonOscillator', { length: 7 }, '__main__'),
            engine.add('AccumulationDistributionLine', {}, '__main__'),
            engine.add('BalanceOfPower', {}, '__main__'),
            engine.add('Trix', { length: 4 }, '__main__'),
            engine.add('Acceleration', { shortLength: 3, longLength: 9, smaLength: 3 }, '__main__'),
            engine.add('ArnaudLegouxMovingAverage', { length: 9, offset: 0.85, sigma: 6 }, '__main__'),
            engine.add('BearPower', { length: 7 }, '__main__'),
            engine.add('BullPower', { length: 7 }, '__main__'),
            engine.add('ChaikinMoneyFlow', { length: 7 }, '__main__'),
            engine.add('ChaikinVolatility', { emaLength: 5, rocLength: 3 }, '__main__'),
            engine.add('CenterOfGravityOscillator', { length: 7 }, '__main__'),
            engine.add('ChaikinOscillator', { fast: 3, slow: 7 }, '__main__'),
            engine.add('ChandeMomentumOscillator', { length: 7 }, '__main__'),
            engine.add('ConnorsRSI', { rsiLength: 3, streakLength: 2, rocLength: 5 }, '__main__'),
            engine.add('DetrendedPriceOscillator', { length: 7 }, '__main__'),
            engine.add('DirectionalIndex', { length: 7 }, '__main__'),
            engine.add('EaseOfMovement', { length: 7 }, '__main__'),
            engine.add('EhlersFisherTransform', { length: 7 }, '__main__'),
            engine.add('FastStochastic', { kPeriod: 7, dPeriod: 3 }, '__main__'),
            engine.add('ApprovalFlowIndex', { length: 7 }, '__main__'),
            engine.add('AdaptiveLaguerreFilter', { gamma: 0.55 }, '__main__'),
            engine.add('AdaptivePriceZone', { period: 7, bandPercentage: 2 }, '__main__'),
            engine.add('BollingerPercentB', { length: 7, stdDevMultiplier: 2 }, '__main__'),
            engine.add('BalanceOfMarketPower', { length: 7 }, '__main__'),
            engine.add('ChoppinessIndex', { length: 7 }, '__main__'),
            engine.add('ChandeKrollStop', {
                period: 7, multiplier: 1.5, stopPeriod: 5,
            }, '__main__'),
            engine.add('ConstanceBrownCompositeIndex', {
                rsiLength: 5, rocLength: 3, shortRsiLength: 3,
                momentumLength: 3, fastSmaLength: 4, slowSmaLength: 7,
            }, '__main__'),
            engine.add('CompositeMomentum', {
                shortRocLength: 3, longRocLength: 7, rsiLength: 5,
                fastLength: 4, slowLength: 7, smaLength: 4,
            }, '__main__'),
            engine.add('ElderImpulseSystem', {
                emaLength: 5, fastLength: 4, slowLength: 8,
            }, '__main__'),
            engine.add('ElderRay', { length: 7 }, '__main__'),
            engine.add('ForceIndex', { length: 7 }, '__main__'),
            engine.add('EndpointMovingAverage', { length: 7 }, '__main__'),
            engine.add('ElliotWaveOscillator', {
                shortPeriod: 4, longPeriod: 11,
            }, '__main__'),
            engine.add('ForecastOscillator', { length: 7 }, '__main__'),
            engine.add('FibonacciRetracement', { length: 7 }, '__main__'),
            engine.add('FractalDimension', { length: 7 }, '__main__'),
            engine.add('FiniteVolumeElement', { length: 7 }, '__main__'),
            engine.add('GopalakrishnanRangeIndex', { length: 7 }, '__main__'),
            engine.add('GuppyMultipleMovingAverage', {}, '__main__'),
            engine.add('HighLowIndex', { length: 7 }, '__main__'),
            engine.add('HarmonicOscillator', { length: 7 }, '__main__'),
            engine.add('HurstExponent', { length: 7 }, '__main__'),
            engine.add('HistoricalVolatilityRatio', {
                shortPeriod: 4, longPeriod: 11,
            }, '__main__'),
            engine.add('IntradayIntensityIndex', { length: 7 }, '__main__'),
            engine.add('IntradayMomentumIndex', { length: 7 }, '__main__'),
            engine.add('JurikMovingAverage', { length: 7, phase: -25 }, '__main__'),
            engine.add('KalmanFilter', {
                length: 7, processNoise: 0.00001, measurementNoise: 0.001,
            }, '__main__'),
            engine.add('KeltnerChannels', { length: 7, multiplier: 2 }, '__main__'),
            engine.add('KasePeakOscillator', {
                atrLength: 7, shortPeriod: 4, longPeriod: 8,
            }, '__main__'),
            engine.add('KnowSureThing', {
                roc1Length: 3, roc2Length: 4, roc3Length: 5, roc4Length: 7,
                sma1Length: 3, sma2Length: 3, sma3Length: 3, sma4Length: 4,
                signalLength: 4,
            }, '__main__'),
            engine.add('KlingerVolumeOscillator', {
                shortPeriod: 4, longPeriod: 9,
            }, '__main__'),
            engine.add('LinearRegressionForecast', { length: 7 }, '__main__'),
            engine.add('LunarPhase', {}, '__main__'),
            engine.add('LinearReg', { length: 7 }, '__main__'),
            engine.add('LinearRegSlope', { length: 7 }, '__main__'),
            engine.add('LaguerreRSI', { gamma: 0.7 }, '__main__'),
            engine.add('MovingAverageCrossover', {
                shortPeriod: 4, longPeriod: 9,
            }, '__main__'),
            engine.add('MovingAverageConvergenceDivergenceSignal', {
                longLength: 9, shortLength: 4, signalLength: 3,
            }, '__main__'),
            engine.add('MovingAverageRibbon', {
                shortPeriod: 2, longPeriod: 4, ribbonCount: 3,
            }, '__main__'),
            engine.add('McClellanOscillator', {
                shortLength: 4, longLength: 9,
            }, '__main__'),
            engine.add('MeanDeviation', { length: 7 }, '__main__'),
            engine.add('Median', { length: 7 }, '__main__'),
            engine.add('MedianPrice', {}, '__main__'),
            engine.add('MarketFacilitationIndex', {}, '__main__'),
            engine.add('McGinleyDynamic', { length: 7 }, '__main__'),
            engine.add('MassIndex', { length: 7, emaLength: 3 }, '__main__'),
            engine.add('MarketMeannessIndex', { length: 9 }, '__main__'),
            engine.add('MomentumOfMovingAverage', {
                length: 7, momentumPeriod: 4,
            }, '__main__'),
            engine.add('MomentumPinball', { length: 7 }, '__main__'),
            engine.add('NickRypockTrailingReverse', {
                length: 7, multiple: 100,
            }, '__main__'),
            engine.add('NegativeVolumeIndex', {}, '__main__'),
            engine.add('OnBalanceVolumeMean', { length: 7 }, '__main__'),
            engine.add('OscillatorOfMovingAverage', {
                shortPeriod: 4, longPeriod: 9,
            }, '__main__'),
            engine.add('OptimalTracking', {}, '__main__'),
            engine.add('PrettyGoodOscillator', { length: 7 }, '__main__'),
            engine.add('PivotPoints', {}, '__main__'),
            engine.add('PassThroughIndicator', {}, '__main__'),
            engine.add('RelativeMomentumIndex', {
                length: 7, momentumPeriod: 3,
            }, '__main__'),
            engine.add('RelativeVigorIndex', {
                length: 4, signalLength: 4,
            }, '__main__'),
            engine.add('RangeActionVerificationIndex', {
                shortLength: 4, longLength: 9,
            }, '__main__'),
            engine.add('RankCorrelationIndex', { length: 7 }, '__main__'),
            engine.add('RainbowCharts', { lines: 4 }, '__main__'),
            engine.add('SuperTrend', { length: 7, multiplier: 2.5 }, '__main__'),
            engine.add('StandardError', { length: 7 }, '__main__'),
            engine.add('Shift', { length: 3 }, '__main__'),
            engine.add('SineWave', { length: 7 }, '__main__'),
            engine.add('SchaffTrendCycle', {
                length: 3,
                shortLength: 4,
                longLength: 8,
                cycleLength: 3,
                signalLength: 2,
            }, '__main__'),
            engine.add('StochasticK', { length: 7 }, '__main__'),
            engine.add('T3MovingAverage', {
                length: 5, volumeFactor: 0.7,
            }, '__main__'),
            engine.add('LinearRegRSquared', { length: 7 }, '__main__'),
            engine.add('PercentagePriceOscillator', {
                shortLength: 4, longLength: 9, signalLength: 3,
            }, '__main__'),
            engine.add('PercentageVolumeOscillator', {
                shortPeriod: 4, longPeriod: 9,
            }, '__main__'),
            engine.add('PositiveVolumeIndex', {}, '__main__'),
            engine.add('PsychologicalLine', { length: 7 }, '__main__'),
            engine.add('PriceChannels', { length: 7 }, '__main__'),
            engine.add('PriceVolumeTrend', {}, '__main__'),
            engine.add('QStick', { length: 7 }, '__main__'),
            engine.add('Trough', { deviation: 0.035 }, '__main__'),
            engine.add('TwiggsMoneyFlow', { length: 7 }, '__main__'),
            engine.add('TrueStrengthIndex', {
                firstLength: 5, secondLength: 4, signalLength: 3,
            }, '__main__'),
            engine.add('TypicalPrice', {}, '__main__'),
            engine.add('UltimateOscillator', {}, '__main__'),
            engine.add('VerticalHorizontalFilter', { length: 7 }, '__main__'),
            engine.add('VortexIndicator', { length: 7 }, '__main__'),
            engine.add('Vidya', { length: 7 }, '__main__'),
            engine.add('VariableMovingAverage', {
                length: 7, volatilityIndex: 0.35,
            }, '__main__'),
            engine.add('WaveTrendOscillator', {
                esaPeriod: 4, dPeriod: 5, averagePeriod: 3,
            }, '__main__'),
            engine.add('WeightedClosePrice', {}, '__main__'),
            engine.add('WilliamsAccumulationDistribution', {}, '__main__'),
            engine.add('WilliamsVariableAccumulationDistribution', {}, '__main__'),
            engine.add('WoodiesCCI', { length: 7, smaLength: 4 }, '__main__'),
            engine.add('ZeroLagExponentialMovingAverage', { length: 7 }, '__main__'),
            engine.add('DonchianChannels', { length: 7 }, '__main__'),
            engine.add('DeMarker', { length: 7 }, '__main__'),
            engine.add('DemandIndex', { length: 7 }, '__main__'),
            engine.add('DisparityIndex', { length: 7 }, '__main__'),
            engine.add('DetrendedSyntheticPrice', { length: 7 }, '__main__'),
            engine.add('DynamicZonesRSI', {
                length: 7, oversoldLevel: 20, overboughtLevel: 80,
            }, '__main__'),
            engine.add('BalanceVolume', {}, '__main__'),
            engine.add('Peak', { deviation: 0.035 }, '__main__'),
            engine.add('RateOfChange', { length: 7 }, '__main__'),
        ];
        const dedicatedSparseScenarios = new Set(['Fractals', 'ZigZag']);
        assert.deepEqual(
            entries.map(entry => entry.type).sort(),
            getIndicatorDefinitions()
                .map(definition => definition.id)
                .filter(id => !dedicatedSparseScenarios.has(id))
                .sort(),
        );
        assert.ok(entries.every((entry) => entry.runtime));
        assert.deepEqual(entries.map((entry) => entry.outputNames[0]), [
            'line', 'line', 'line', 'oscillator', 'line', 'line', 'line',
            'upper', 'macd', 'k', 'plusDI', 'line', 'tenkan', 'line', 'line',
            'value', 'line', 'line', 'line', 'line', 'line', 'line', 'line', 'line',
            'line', 'line', 'jaw', 'upper', 'line', 'line', 'line', 'line', 'line',
            'value',
            'line',
            'upper',
            'value',
            'up',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'rsi',
            'line',
            'plusDI',
            'line',
            'main',
            'k',
            'line',
            'line',
            'ma',
            'line',
            'line',
            'line',
            'longStop',
            'composite',
            'composite',
            'impulse',
            'bull',
            'line',
            'line',
            'line',
            'line',
            'l236',
            'line',
            'line',
            'line',
            'short3',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'upper',
            'shortTerm',
            'kst',
            'shortEma',
            'line',
            'line',
            'line',
            'line',
            'line',
            'signal',
            'macd',
            'ribbon0',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'pp',
            'line',
            'line',
            'rvi',
            'line',
            'line',
            'sma1',
            'value',
            'line',
            'line',
            'sine',
            'line',
            'line',
            'line',
            'line',
            'ppo',
            'shortEma',
            'line',
            'line',
            'upper',
            'line',
            'line',
            'value',
            'line',
            'tsi',
            'line',
            'line',
            'line',
            'viPlus',
            'line',
            'line',
            'wt1',
            'line',
            'line',
            'line',
            'cci',
            'line',
            'upper',
            'line',
            'line',
            'line',
            'line',
            'line',
            'line',
            'value',
            'line',
        ]);
        assert.ok(entries.every((entry) => (
            entry.seriesRefs.every((series) => series.setDataCalls === 1)
        )));
        assert.ok(entries.every((entry) => entry.runtime.retainedFrom === 39));
        assert.ok(entries.every((entry) => entry.runtime.inputs().length === 0));
        assert.ok(entries.every((entry) => (
            entry._runtimeLegendTailTargets.length === entry._points.length
        )));
        const movingAverageRibbon = entries.find(
            (entry) => entry.type === 'MovingAverageRibbon',
        );
        assert.deepEqual(movingAverageRibbon.outputNames, [
            'ribbon0', 'ribbon1', 'ribbon2',
        ]);
        assert.equal(movingAverageRibbon.seriesRefs.length, 3);
        const rainbowEntry = entries.find(entry => entry.type === 'RainbowCharts');
        assert.deepEqual(rainbowEntry.outputNames, ['sma1', 'sma2', 'sma3']);
        assert.equal(rainbowEntry.seriesRefs.length, 3);
        assert.ok(rainbowEntry.seriesRefs.every(series => series.definition.type === 'Line'));
        const pivotEntry = entries.find(entry => entry.type === 'PivotPoints');
        assert.deepEqual(pivotEntry.outputNames, ['pp', 'r1', 'r2', 's1', 's2']);
        assert.equal(pivotEntry.seriesRefs.length, 5);
        assert.ok(pivotEntry.seriesRefs.every(series => series.definition.type === 'Line'));
        const passThroughEntry = entries.find(
            entry => entry.type === 'PassThroughIndicator',
        );
        assert.deepEqual(passThroughEntry.outputNames, ['line']);
        assert.equal(passThroughEntry.seriesRefs[0].definition.type, 'Line');
        const rviEntry = entries.find(entry => entry.type === 'RelativeVigorIndex');
        assert.deepEqual(rviEntry.outputNames, ['rvi', 'signal']);
        assert.equal(rviEntry.seriesRefs.length, 2);
        assert.ok(rviEntry.seriesRefs.every(series => series.definition.type === 'Line'));
        const superTrendEntry = entries.find(entry => entry.type === 'SuperTrend');
        assert.deepEqual(superTrendEntry.outputNames, ['value']);
        assert.equal(superTrendEntry.seriesRefs[0].definition.type, 'Line');
        assert.equal(typeof superTrendEntry.seriesRefs[0].data.at(-1).up, 'boolean');
        const sineWaveEntry = entries.find(entry => entry.type === 'SineWave');
        assert.deepEqual(sineWaveEntry.outputNames, ['sine', 'leadsine']);
        assert.equal(sineWaveEntry.seriesRefs.length, 2);
        assert.ok(sineWaveEntry.seriesRefs.every(series => series.definition.type === 'Line'));
        const schaffTrendCycleEntry = entries.find(
            entry => entry.type === 'SchaffTrendCycle',
        );
        assert.deepEqual(schaffTrendCycleEntry.outputNames, ['line']);
        assert.equal(schaffTrendCycleEntry.seriesRefs.length, 1);
        assert.equal(schaffTrendCycleEntry.seriesRefs[0].definition.type, 'Line');
        const stochasticKEntry = entries.find(entry => entry.type === 'StochasticK');
        assert.deepEqual(stochasticKEntry.outputNames, ['line']);
        assert.equal(stochasticKEntry.seriesRefs.length, 1);
        assert.equal(stochasticKEntry.seriesRefs[0].definition.type, 'Line');
        const t3Entry = entries.find(entry => entry.type === 'T3MovingAverage');
        assert.deepEqual(t3Entry.outputNames, ['line']);
        assert.equal(t3Entry.seriesRefs.length, 1);
        assert.equal(t3Entry.seriesRefs[0].definition.type, 'Line');
        const rSquaredEntry = entries.find(entry => entry.type === 'LinearRegRSquared');
        assert.deepEqual(rSquaredEntry.outputNames, ['line']);
        assert.equal(rSquaredEntry.seriesRefs.length, 1);
        assert.equal(rSquaredEntry.seriesRefs[0].definition.type, 'Line');
        const ppoEntry = entries.find(
            entry => entry.type === 'PercentagePriceOscillator',
        );
        assert.deepEqual(ppoEntry.outputNames, ['ppo', 'signal', 'histogram']);
        assert.deepEqual(
            ppoEntry.seriesRefs.map(series => series.definition.type),
            ['Histogram', 'Line', 'Line'],
        );
        const pvoEntry = entries.find(
            entry => entry.type === 'PercentageVolumeOscillator',
        );
        assert.deepEqual(pvoEntry.outputNames, ['shortEma', 'longEma', 'pvo']);
        assert.equal(pvoEntry.seriesRefs.length, 3);
        assert.ok(pvoEntry.seriesRefs.every(series => series.definition.type === 'Line'));
        const pviEntry = entries.find(entry => entry.type === 'PositiveVolumeIndex');
        assert.deepEqual(pviEntry.outputNames, ['line']);
        assert.equal(pviEntry.seriesRefs.length, 1);
        assert.equal(pviEntry.seriesRefs[0].definition.type, 'Line');
        const psychologicalLineEntry = entries.find(
            entry => entry.type === 'PsychologicalLine',
        );
        assert.deepEqual(psychologicalLineEntry.outputNames, ['line']);
        assert.equal(psychologicalLineEntry.seriesRefs.length, 1);
        assert.equal(psychologicalLineEntry.seriesRefs[0].definition.type, 'Line');
        const priceChannelsEntry = entries.find(entry => entry.type === 'PriceChannels');
        assert.deepEqual(priceChannelsEntry.outputNames, ['upper', 'lower']);
        assert.equal(priceChannelsEntry.seriesRefs.length, 1);
        assert.equal(priceChannelsEntry.seriesRefs[0].definition.type, 'Band');
        assert.equal(typeof priceChannelsEntry.seriesRefs[0].data.at(-1).upper, 'number');
        assert.equal(typeof priceChannelsEntry.seriesRefs[0].data.at(-1).lower, 'number');
        const priceVolumeTrendEntry = entries.find(
            entry => entry.type === 'PriceVolumeTrend',
        );
        assert.deepEqual(priceVolumeTrendEntry.outputNames, ['line']);
        assert.equal(priceVolumeTrendEntry.seriesRefs.length, 1);
        assert.equal(priceVolumeTrendEntry.seriesRefs[0].definition.type, 'Line');
        const qStickEntry = entries.find(entry => entry.type === 'QStick');
        assert.deepEqual(qStickEntry.outputNames, ['line']);
        assert.equal(qStickEntry.seriesRefs.length, 1);
        assert.equal(qStickEntry.seriesRefs[0].definition.type, 'Line');
        const troughEntry = entries.find(entry => entry.type === 'Trough');
        assert.deepEqual(troughEntry.outputNames, ['value']);
        assert.equal(troughEntry.seriesRefs.length, 1);
        assert.equal(troughEntry.seriesRefs[0].definition.type, 'Line');
        const twapEntry = entries.find(
            entry => entry.type === 'TimeWeightedAveragePrice',
        );
        assert.deepEqual(twapEntry.outputNames, ['line']);
        assert.equal(twapEntry.seriesRefs.length, 1);
        assert.equal(twapEntry.seriesRefs[0].definition.type, 'Line');
        const vwapEntry = entries.find(
            entry => entry.type === 'VolumeWeightedAveragePrice',
        );
        assert.deepEqual(vwapEntry.outputNames, ['line']);
        assert.equal(vwapEntry.seriesRefs.length, 1);
        assert.equal(vwapEntry.seriesRefs[0].definition.type, 'Line');
        const vwmaEntry = entries.find(
            entry => entry.type === 'VolumeWeightedMovingAverage',
        );
        assert.deepEqual(vwmaEntry.outputNames, ['line']);
        assert.equal(vwmaEntry.seriesRefs.length, 1);
        assert.equal(vwmaEntry.seriesRefs[0].definition.type, 'Line');
        const twiggsEntry = entries.find(entry => entry.type === 'TwiggsMoneyFlow');
        assert.deepEqual(twiggsEntry.outputNames, ['line']);
        assert.equal(twiggsEntry.seriesRefs.length, 1);
        assert.equal(twiggsEntry.seriesRefs[0].definition.type, 'Line');
        const trueRangeEntry = entries.find(entry => entry.type === 'TrueRange');
        assert.deepEqual(trueRangeEntry.outputNames, ['line']);
        assert.equal(trueRangeEntry.seriesRefs.length, 1);
        assert.equal(trueRangeEntry.seriesRefs[0].definition.type, 'Line');
        const tsiEntry = entries.find(entry => entry.type === 'TrueStrengthIndex');
        assert.deepEqual(tsiEntry.outputNames, ['tsi', 'signal']);
        assert.equal(tsiEntry.seriesRefs.length, 2);
        assert.ok(tsiEntry.seriesRefs.every(series => series.definition.type === 'Line'));
        const typicalPriceEntry = entries.find(entry => entry.type === 'TypicalPrice');
        assert.deepEqual(typicalPriceEntry.outputNames, ['line']);
        assert.equal(typicalPriceEntry.seriesRefs.length, 1);
        assert.equal(typicalPriceEntry.seriesRefs[0].definition.type, 'Line');
        const ultimateEntry = entries.find(entry => entry.type === 'UltimateOscillator');
        assert.deepEqual(ultimateEntry.outputNames, ['line']);
        assert.equal(ultimateEntry.seriesRefs.length, 1);
        assert.equal(ultimateEntry.seriesRefs[0].definition.type, 'Line');
        const vhfEntry = entries.find(entry => entry.type === 'VerticalHorizontalFilter');
        assert.deepEqual(vhfEntry.outputNames, ['line']);
        assert.equal(vhfEntry.seriesRefs.length, 1);
        assert.equal(vhfEntry.seriesRefs[0].definition.type, 'Line');
        const vortexEntry = entries.find(entry => entry.type === 'VortexIndicator');
        assert.deepEqual(vortexEntry.outputNames, ['viPlus', 'viMinus']);
        assert.equal(vortexEntry.seriesRefs.length, 2);
        assert.ok(vortexEntry.seriesRefs.every(series => series.definition.type === 'Line'));
        const vidyaEntry = entries.find(entry => entry.type === 'Vidya');
        assert.deepEqual(vidyaEntry.outputNames, ['line']);
        assert.equal(vidyaEntry.seriesRefs.length, 1);
        assert.equal(vidyaEntry.seriesRefs[0].definition.type, 'Line');
        const vmaEntry = entries.find(entry => entry.type === 'VariableMovingAverage');
        assert.deepEqual(vmaEntry.outputNames, ['line']);
        assert.equal(vmaEntry.seriesRefs.length, 1);
        assert.equal(vmaEntry.seriesRefs[0].definition.type, 'Line');
        const waveTrendEntry = entries.find(
            entry => entry.type === 'WaveTrendOscillator',
        );
        assert.deepEqual(waveTrendEntry.outputNames, ['wt1', 'wt2']);
        assert.equal(waveTrendEntry.seriesRefs.length, 2);
        assert.ok(waveTrendEntry.seriesRefs.every(
            series => series.definition.type === 'Line',
        ));
        const weightedCloseEntry = entries.find(
            entry => entry.type === 'WeightedClosePrice',
        );
        assert.deepEqual(weightedCloseEntry.outputNames, ['line']);
        assert.equal(weightedCloseEntry.seriesRefs.length, 1);
        assert.equal(weightedCloseEntry.seriesRefs[0].definition.type, 'Line');
        const wilderEntry = entries.find(entry => entry.type === 'WilderMovingAverage');
        assert.deepEqual(wilderEntry.outputNames, ['line']);
        assert.equal(wilderEntry.seriesRefs.length, 1);
        assert.equal(wilderEntry.seriesRefs[0].definition.type, 'Line');
        const williamsAdEntry = entries.find(
            entry => entry.type === 'WilliamsAccumulationDistribution',
        );
        assert.deepEqual(williamsAdEntry.outputNames, ['line']);
        assert.equal(williamsAdEntry.seriesRefs.length, 1);
        assert.equal(williamsAdEntry.seriesRefs[0].definition.type, 'Line');
        const wvadEntry = entries.find(
            entry => entry.type === 'WilliamsVariableAccumulationDistribution',
        );
        assert.deepEqual(wvadEntry.outputNames, ['line']);
        assert.equal(wvadEntry.seriesRefs.length, 1);
        assert.equal(wvadEntry.seriesRefs[0].definition.type, 'Line');
        const woodiesEntry = entries.find(entry => entry.type === 'WoodiesCCI');
        assert.deepEqual(woodiesEntry.outputNames, ['cci', 'signal']);
        assert.equal(woodiesEntry.seriesRefs.length, 2);
        assert.ok(woodiesEntry.seriesRefs.every(series => series.definition.type === 'Line'));
        const zlemaEntry = entries.find(
            entry => entry.type === 'ZeroLagExponentialMovingAverage',
        );
        assert.deepEqual(zlemaEntry.outputNames, ['line']);
        assert.equal(zlemaEntry.seriesRefs.length, 1);
        assert.equal(zlemaEntry.seriesRefs[0].definition.type, 'Line');
        const donchianEntry = entries.find(entry => entry.type === 'DonchianChannels');
        assert.deepEqual(donchianEntry.outputNames, ['upper', 'middle', 'lower']);
        assert.equal(donchianEntry.seriesRefs.length, 2);
        assert.deepEqual(
            donchianEntry.seriesRefs.map(series => series.definition.type),
            ['Band', 'Line'],
        );
        const deMarkerEntry = entries.find(entry => entry.type === 'DeMarker');
        assert.deepEqual(deMarkerEntry.outputNames, ['line']);
        assert.equal(deMarkerEntry.seriesRefs.length, 1);
        assert.equal(deMarkerEntry.seriesRefs[0].definition.type, 'Line');
        const demandIndexEntry = entries.find(entry => entry.type === 'DemandIndex');
        assert.deepEqual(demandIndexEntry.outputNames, ['line']);
        assert.equal(demandIndexEntry.seriesRefs.length, 1);
        assert.equal(demandIndexEntry.seriesRefs[0].definition.type, 'Line');
        const disparityIndexEntry = entries.find(entry => entry.type === 'DisparityIndex');
        assert.deepEqual(disparityIndexEntry.outputNames, ['line']);
        assert.equal(disparityIndexEntry.seriesRefs.length, 1);
        assert.equal(disparityIndexEntry.seriesRefs[0].definition.type, 'Line');
        const dspEntry = entries.find(entry => entry.type === 'DetrendedSyntheticPrice');
        assert.deepEqual(dspEntry.outputNames, ['line']);
        assert.equal(dspEntry.seriesRefs.length, 1);
        assert.equal(dspEntry.seriesRefs[0].definition.type, 'Line');
        const dynamicZonesRsiEntry = entries.find(
            entry => entry.type === 'DynamicZonesRSI',
        );
        assert.deepEqual(dynamicZonesRsiEntry.outputNames, ['line']);
        assert.equal(dynamicZonesRsiEntry.seriesRefs.length, 1);
        assert.equal(dynamicZonesRsiEntry.seriesRefs[0].definition.type, 'Line');
        const balanceVolumeEntry = entries.find(entry => entry.type === 'BalanceVolume');
        assert.deepEqual(balanceVolumeEntry.outputNames, ['line']);
        assert.equal(balanceVolumeEntry.seriesRefs.length, 1);
        assert.equal(balanceVolumeEntry.seriesRefs[0].definition.type, 'Line');
        const peakEntry = entries.find(entry => entry.type === 'Peak');
        assert.deepEqual(peakEntry.outputNames, ['value']);
        assert.equal(peakEntry.seriesRefs.length, 1);
        assert.equal(peakEntry.seriesRefs[0].definition.type, 'Line');
        const rateOfChangeEntry = entries.find(entry => entry.type === 'RateOfChange');
        assert.deepEqual(rateOfChangeEntry.outputNames, ['line']);
        assert.equal(rateOfChangeEntry.seriesRefs.length, 1);
        assert.equal(rateOfChangeEntry.seriesRefs[0].definition.type, 'Line');

        candles[candles.length - 1].close += 5;
        candles[candles.length - 1].high += 5;
        for (let index = 0; index < 100; index++) engine.onLiveUpdate();
        await new Promise((resolve) => setTimeout(resolve, 10));

        assert.ok(entries.every((entry) => (
            entry.seriesRefs.every((series) => series.setDataCalls === 1)
        )));
        assert.ok(entries.every((entry) => (
            entry.seriesRefs.every((series) => series.updateCalls <= 1)
        )));
        assert.ok(entries.some((entry) => (
            entry.seriesRefs.some((series) => series.updateCalls === 1)
        )));
        const bandSeries = entries[7].seriesRefs[0];
        const bandPoint = bandSeries.data[bandSeries.data.length - 1];
        assert.equal(bandSeries.updateCalls, 1);
        assert.equal(typeof bandPoint.upper, 'number');
        assert.equal(typeof bandPoint.lower, 'number');
        assert.ok(entries[8].seriesRefs.every((series) => series.updateCalls === 1));
        assert.ok(entries[9].seriesRefs.every((series) => series.updateCalls === 1));
        assert.ok(entries[10].seriesRefs.some((series) => series.updateCalls === 1));
        assert.equal(entries[11].seriesRefs[0].updateCalls, 1);
        assert.ok(entries[12].seriesRefs.slice(0, 3).every((series) => series.updateCalls === 1));
        assert.equal(entries[12].seriesRefs[3].updateCalls, 0);
        const envelope = entries.find((entry) => entry.type === 'Envelope');
        assert.ok(envelope.seriesRefs.every((series) => series.updateCalls === 1));
        const envelopeBand = envelope.seriesRefs[0].data.at(-1);
        assert.equal(typeof envelopeBand.upper, 'number');
        assert.equal(typeof envelopeBand.lower, 'number');
        const adaptivePriceZone = entries.find((entry) => entry.type === 'AdaptivePriceZone');
        assert.deepEqual(
            adaptivePriceZone.seriesRefs.map((series) => series.definition.type),
            ['Band', 'Line'],
        );
        assert.ok(adaptivePriceZone.seriesRefs.every((series) => series.updateCalls === 1));
        const chandeKroll = entries.find((entry) => entry.type === 'ChandeKrollStop');
        assert.deepEqual(
            chandeKroll.seriesRefs.map((series) => series.definition.type),
            ['Line', 'Line'],
        );
        assert.ok(chandeKroll.seriesRefs.every((series) => series.updateCalls === 1));
        const awesome = entries.find((entry) => entry.type === 'AwesomeOscillator');
        assert.equal(awesome.seriesRefs[0].definition.type, 'Histogram');
        assert.equal(awesome.seriesRefs[0].updateCalls, 1);
        assert.equal(typeof awesome.seriesRefs[0].data.at(-1).up, 'boolean');
        assert.ok(entries.every((entry) => entry.runtime.committedCount === 39));
        assert.ok(entries.every((entry) => entry.runtime.hasPreview));

        const previous = candles[candles.length - 1];
        candles.push({
            time: previous.time + 60,
            open: previous.close,
            high: previous.close + 2,
            low: previous.close - 1,
            close: previous.close + 1,
            volume: previous.volume + 10,
        });
        engine.onLiveUpdate();
        await new Promise((resolve) => setTimeout(resolve, 10));

        assert.ok(entries.every((entry) => (
            entry.seriesRefs.every((series) => series.setDataCalls === 1)
        )));
        assert.ok(entries.every((entry) => (
            entry.seriesRefs.every((series) => series.updateCalls <= 2)
        )));
        assert.ok(entries.every((entry) => entry.runtime.committedCount === 40));
        assert.ok(entries.every((entry) => entry.runtime.retainedFrom === 40));
        assert.ok(entries.every((entry) => entry.runtime.inputs().length === 0));
        assert.equal(entries[12].seriesRefs[3].updateCalls, 1);
        const values = engine.getValuesAt(candles[candles.length - 1].time);
        const sparseKinds = new Set(['Peak', 'Trough']);
        assert.ok(values.filter((item) => !sparseKinds.has(item.type)).every((item) => (
            typeof Object.values(item.values)[0] === 'number'
        )));
        assert.deepEqual(
            values.find((item) => item.type === 'Peak').values,
            { value: null },
        );
        assert.deepEqual(
            values.find((item) => item.type === 'Trough').values,
            { value: null },
        );
    });

    it('reseeds compact runtime data when a patch is not tail-safe', async () => {
        const chart = chartMock();
        const engine = new IndicatorEngine();
        const candles = Array.from({ length: 20 }, (_, index) => ({
            time: 1_700_100_000 + index * 60,
            open: 50 + index,
            high: 52 + index,
            low: 49 + index,
            close: 51 + index,
            volume: 500 + index,
        }));
        engine.setRenderer(new IndicatorRenderer(chart));
        engine.setCandles(candles);
        const entry = engine.add('SimpleMovingAverage', { length: 5 }, '__main__');
        const series = entry.seriesRefs[0];
        assert.equal(series.setDataCalls, 1);
        assert.equal(entry.runtime.retainedFrom, 19);

        // Simulate a stale/foreign painter tail. The patch must not rebuild from
        // compact runtime.points(), because that contains only the preview.
        entry._runtimeTailHistory.line = [];
        candles[candles.length - 1].close += 10;
        engine.onLiveUpdate();
        await new Promise((resolve) => setTimeout(resolve, 10));

        assert.equal(series.updateCalls, 0);
        assert.equal(series.setDataCalls, 2);
        assert.ok(series.data.length > 1);
        assert.equal(entry.runtime.retainedFrom, 19);

        candles[candles.length - 1].close += 1;
        engine.onLiveUpdate();
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(series.setDataCalls, 2);
        assert.equal(series.updateCalls, 1);
    });

    it('applies a correction that discards and restores the live preview as tail patches', () => {
        const chart = chartMock();
        const engine = new IndicatorEngine();
        const candles = Array.from({ length: 8 }, (_, index) => ({
            time: 1_700_200_000 + index * 60,
            open: 100 + index,
            high: 102 + index,
            low: 99 + index,
            close: 101 + index,
            volume: 1_000 + index,
        }));
        engine.setRenderer(new IndicatorRenderer(chart));
        engine.setCandles(candles);
        const entry = engine.add('SimpleMovingAverage', { length: 3 }, '__main__');
        const series = entry.seriesRefs[0];
        const originalLength = series.data.length;

        const discarded = entry.runtime.discardPreview();
        assert.equal(discarded.kind, 'correction');
        assert.equal(engine._applyRuntimePatch(entry, discarded), true);
        assert.equal(series.setDataCalls, 1);
        assert.equal(series.popCalls, 1);
        assert.equal(series.data.length, originalLength - 1);

        const restored = entry.runtime.update(engine._runtimeInput(candles.at(-1)), false);
        assert.equal(engine._applyRuntimePatch(entry, restored), true);
        assert.equal(series.updateCalls, 1);
        assert.equal(series.data.length, originalLength);
        assert.equal(entry._runtimeLegendTailTargets.length, entry._points.length);
    });

    it('rewinds a derived candle tail without reseeding indicator history', async () => {
        const chart = chartMock();
        const engine = new IndicatorEngine();
        const candles = Array.from({ length: 5 }, (_, index) => ({
            time: 10 + index,
            open: 100 + index,
            high: 101 + index,
            low: 99 + index,
            close: 100 + index,
            volume: 1,
        }));
        engine.setRenderer(new IndicatorRenderer(chart));
        engine.setCandles(candles, { rewindableTail: true });
        const entry = engine.add('SimpleMovingAverage', { length: 2 }, '__main__');
        const bandEntry = engine.add('BollingerBands', {
            length: 2, stdDev: 2,
        }, '__main__');
        const series = entry.seriesRefs[0];
        const band = bandEntry.seriesRefs[0];

        assert.equal(entry.runtime.retainedFrom, 0);
        assert.equal(entry.runtime.inputs().length, 4);
        assert.equal(series.setDataCalls, 1);

        candles.length = 3;
        engine.onLiveUpdate();
        await new Promise(resolve => setTimeout(resolve, 10));

        assert.equal(series.setDataCalls, 1);
        assert.equal(series.popCalls, 3);
        assert.equal(series.updateCalls, 1);
        assert.deepEqual(series.data.map(point => point.time), [11, 12]);
        assert.equal(band.setDataCalls, 1);
        assert.equal(band.popCalls, 3);
        assert.equal(band.updateCalls, 1);
        assert.deepEqual(band.data.map(point => point.time), [11, 12]);
        assert.equal(entry.runtime.committedCount, 2);
        assert.equal(entry.runtime.hasPreview, true);
        assert.equal(entry.runtime.inputs().length, 2);
        assert.deepEqual(engine.getValuesAt(12)[0].values, { line: 101.5 });
    });

    it('resolves the painter named by the catalog and delegates updates', () => {
        const chart = chartMock();
        const renderer = new IndicatorRenderer(chart);
        let updates = 0;
        let disposed = 0;
        const unregister = registerIndicatorPainter('test-custom', () => ({
            paint(context) {
                const color = context.nextColor();
                const series = context.addSeries('histogram', { color }, context.output('bars'));
                return { series: [series], colors: [color] };
            },
            update(context, series) {
                updates++;
                series[0].setData(context.output('bars'));
            },
            dispose() { disposed++; },
        }));

        try {
            const entry = { type: 'CustomIndicator', outputNames: ['bars'], seriesRefs: [] };
            const settings = { name: 'Custom', painter: 'test-custom' };
            entry.seriesRefs = renderer.render(entry, { bars: [{ time: 1, value: 2 }] }, null, settings);
            assert.equal(chart.added[0].definition.type, 'Histogram');

            renderer.update(entry, { bars: [{ time: 2, value: 3 }] }, null, settings);
            assert.equal(updates, 1);
            assert.deepEqual(chart.added[0].data, [{ time: 2, value: 3 }]);

            renderer.removeSeries(entry);
            assert.equal(disposed, 1);
            assert.equal(chart.removed.length, 1);
        } finally {
            unregister();
        }
    });

    it('catalog painter names all resolve and ordinary indicators remain unassigned', () => {
        const catalog = getClientCatalog();
        const configured = catalog.filter(entry => entry.painter);
        assert.ok(configured.length >= 10);
        for (const entry of configured) {
            assert.ok(hasIndicatorPainter(entry.painter), `${entry.id}: unknown painter '${entry.painter}'`);
        }

        const sma = catalog.find(entry => entry.id === 'SimpleMovingAverage');
        assert.equal(sma.painter, undefined);
        assert.equal(
            catalog.find(entry => entry.id === 'ConstanceBrownCompositeIndex').painter,
            undefined,
        );
        assert.equal(
            catalog.find(entry => entry.id === 'FibonacciRetracement').painter,
            undefined,
        );
        const fractalDimension = catalog.find(entry => entry.id === 'FractalDimension');
        assert.equal(fractalDimension.painter, undefined);
        assert.deepEqual(fractalDimension.scaleRange, { min: 1, max: 2 });
        assert.deepEqual(fractalDimension.levels, [1.5]);
        const highLowIndex = catalog.find(entry => entry.id === 'HighLowIndex');
        assert.equal(highLowIndex.painter, undefined);
        assert.deepEqual(highLowIndex.scaleRange, { min: 0, max: 100 });
        assert.deepEqual(highLowIndex.levels, [50]);
        const intradayMomentum = catalog.find(entry => entry.id === 'IntradayMomentumIndex');
        assert.equal(intradayMomentum.painter, undefined);
        assert.deepEqual(intradayMomentum.scaleRange, { min: 0, max: 100 });
        assert.deepEqual(intradayMomentum.levels, [30, 70]);
        assert.equal(catalog.find(entry => entry.id === 'JurikMovingAverage').painter, undefined);
        const kalman = catalog.find(entry => entry.id === 'KalmanFilter');
        assert.equal(kalman.painter, undefined);
        assert.deepEqual(kalman.params.map(parameter => parameter.key), [
            'length', 'processNoise', 'measurementNoise',
        ]);
        assert.equal(catalog.find(entry => entry.id === 'KeltnerChannels').painter, undefined);
        const kasePeak = catalog.find(entry => entry.id === 'KasePeakOscillator');
        assert.equal(kasePeak.painter, undefined);
        assert.deepEqual(kasePeak.params.map(parameter => parameter.key), [
            'atrLength', 'shortPeriod', 'longPeriod',
        ]);
        assert.equal(catalog.find(entry => entry.id === 'KnowSureThing').painter, undefined);
        assert.equal(
            catalog.find(entry => entry.id === 'KlingerVolumeOscillator').painter,
            undefined,
        );
        assert.equal(
            catalog.find(entry => entry.id === 'LinearRegressionForecast').painter,
            undefined,
        );
        const lunarPhase = catalog.find(entry => entry.id === 'LunarPhase');
        assert.equal(lunarPhase.painter, undefined);
        assert.deepEqual(lunarPhase.scaleRange, { min: 0, max: 7 });
        assert.equal(catalog.find(entry => entry.id === 'LinearReg').painter, undefined);
        assert.equal(catalog.find(entry => entry.id === 'LinearRegSlope').painter, undefined);
        const laguerreRsi = catalog.find(entry => entry.id === 'LaguerreRSI');
        assert.equal(laguerreRsi.painter, undefined);
        assert.deepEqual(laguerreRsi.scaleRange, { min: 0, max: 100 });
        assert.deepEqual(laguerreRsi.levels, [20, 80]);
        const movingAverageCrossover = catalog.find(
            entry => entry.id === 'MovingAverageCrossover',
        );
        assert.equal(movingAverageCrossover.painter, undefined);
        assert.deepEqual(movingAverageCrossover.scaleRange, { min: -1, max: 1 });
        assert.deepEqual(movingAverageCrossover.levels, [0]);
        const macdSignal = catalog.find(
            entry => entry.id === 'MovingAverageConvergenceDivergenceSignal',
        );
        assert.equal(macdSignal.painter, 'dual-line');
        assert.deepEqual(macdSignal.outputs, ['macd', 'signal']);
        const ribbonCatalog = catalog.find(entry => entry.id === 'MovingAverageRibbon');
        assert.equal(ribbonCatalog.painter, undefined);
        assert.deepEqual(
            ribbonCatalog.outputs,
            Array.from({ length: 10 }, (_, index) => `ribbon${index}`),
        );
        const mcClellan = catalog.find(entry => entry.id === 'McClellanOscillator');
        assert.equal(mcClellan.painter, undefined);
        assert.deepEqual(mcClellan.levels, [0]);
        const meanDeviation = catalog.find(entry => entry.id === 'MeanDeviation');
        assert.equal(meanDeviation.painter, undefined);
        assert.equal(meanDeviation.group, 'Volatility');
        const median = catalog.find(entry => entry.id === 'Median');
        assert.equal(median.painter, undefined);
        assert.equal(median.group, 'Trend');
        const medianPrice = catalog.find(entry => entry.id === 'MedianPrice');
        assert.equal(medianPrice.painter, undefined);
        assert.equal(medianPrice.group, 'Price');
        const marketFacilitation = catalog.find(
            entry => entry.id === 'MarketFacilitationIndex',
        );
        assert.equal(marketFacilitation.painter, undefined);
        assert.equal(marketFacilitation.group, 'Volume');
        const mcGinley = catalog.find(entry => entry.id === 'McGinleyDynamic');
        assert.equal(mcGinley.painter, undefined);
        assert.equal(mcGinley.group, 'Trend');
        const massIndex = catalog.find(entry => entry.id === 'MassIndex');
        assert.equal(massIndex.painter, undefined);
        assert.equal(massIndex.group, 'Volatility');
        assert.deepEqual(massIndex.levels, [26.5, 27]);
        const marketMeanness = catalog.find(entry => entry.id === 'MarketMeannessIndex');
        assert.equal(marketMeanness.painter, undefined);
        assert.equal(marketMeanness.group, 'Market Strength');
        assert.deepEqual(marketMeanness.levels, [50]);
        const momentumOfMa = catalog.find(
            entry => entry.id === 'MomentumOfMovingAverage',
        );
        assert.equal(momentumOfMa.painter, undefined);
        assert.equal(momentumOfMa.group, 'Momentum');
        assert.deepEqual(momentumOfMa.levels, [0]);
        assert.deepEqual(momentumOfMa.params.map(parameter => parameter.key), [
            'length', 'momentumPeriod',
        ]);
        const momentumPinball = catalog.find(entry => entry.id === 'MomentumPinball');
        assert.equal(momentumPinball.painter, undefined);
        assert.equal(momentumPinball.group, 'Momentum');
        assert.deepEqual(momentumPinball.scaleRange, { min: -100, max: 100 });
        assert.deepEqual(momentumPinball.levels, [0]);
        const nrtr = catalog.find(entry => entry.id === 'NickRypockTrailingReverse');
        assert.equal(nrtr.painter, undefined);
        assert.equal(nrtr.group, 'Trend');
        const negativeVolume = catalog.find(entry => entry.id === 'NegativeVolumeIndex');
        assert.equal(negativeVolume.painter, undefined);
        assert.equal(negativeVolume.group, 'Volume');
        const obvMean = catalog.find(entry => entry.id === 'OnBalanceVolumeMean');
        assert.equal(obvMean.painter, undefined);
        assert.equal(obvMean.group, 'Volume');
        const oscillatorOfMa = catalog.find(
            entry => entry.id === 'OscillatorOfMovingAverage',
        );
        assert.equal(oscillatorOfMa.painter, undefined);
        assert.equal(oscillatorOfMa.group, 'Momentum');
        assert.deepEqual(oscillatorOfMa.levels, [0]);
        const optimalTracking = catalog.find(entry => entry.id === 'OptimalTracking');
        assert.equal(optimalTracking.painter, undefined);
        assert.equal(optimalTracking.group, 'Trend');
        const pgo = catalog.find(entry => entry.id === 'PrettyGoodOscillator');
        assert.equal(pgo.painter, undefined);
        assert.equal(pgo.group, 'Momentum');
        assert.deepEqual(pgo.levels, [0]);
        const pivotPoints = catalog.find(entry => entry.id === 'PivotPoints');
        assert.equal(pivotPoints.painter, undefined);
        assert.equal(pivotPoints.group, 'Price');
        assert.deepEqual(pivotPoints.outputs, ['pp', 'r1', 'r2', 's1', 's2']);
        const passThrough = catalog.find(entry => entry.id === 'PassThroughIndicator');
        assert.equal(passThrough.painter, undefined);
        assert.equal(passThrough.group, 'Price');
        const rmi = catalog.find(entry => entry.id === 'RelativeMomentumIndex');
        assert.equal(rmi.painter, undefined);
        assert.equal(rmi.group, 'Momentum');
        assert.equal(rmi.params.find(parameter => parameter.key === 'momentumPeriod').default, 3);
        assert.deepEqual(rmi.scaleRange, { min: 0, max: 100 });
        assert.deepEqual(rmi.levels, [30, 70]);
        const rvi = catalog.find(entry => entry.id === 'RelativeVigorIndex');
        assert.equal(rvi.painter, 'dual-line');
        assert.deepEqual(rvi.outputs, ['rvi', 'signal']);
        assert.deepEqual(rvi.params.map(parameter => parameter.default), [4, 4]);
        assert.deepEqual(rvi.scaleRange, { min: -1, max: 1 });
        assert.deepEqual(rvi.levels, [0]);
        const ravi = catalog.find(
            entry => entry.id === 'RangeActionVerificationIndex',
        );
        assert.equal(ravi.painter, undefined);
        assert.equal(ravi.group, 'Market Strength');
        const rci = catalog.find(entry => entry.id === 'RankCorrelationIndex');
        assert.equal(rci.painter, undefined);
        assert.equal(rci.group, 'Momentum');
        assert.deepEqual(rci.scaleRange, { min: -1, max: 1 });
        assert.deepEqual(rci.levels, [0]);
        const rainbow = catalog.find(entry => entry.id === 'RainbowCharts');
        assert.equal(rainbow.painter, undefined);
        assert.equal(rainbow.group, 'Trend');
        assert.deepEqual(
            rainbow.outputs,
            Array.from({ length: 9 }, (_, index) => `sma${index + 1}`),
        );
        const superTrend = catalog.find(entry => entry.id === 'SuperTrend');
        assert.equal(superTrend.painter, undefined);
        assert.equal(superTrend.group, 'Trend');
        assert.deepEqual(superTrend.outputs, ['value']);
        assert.equal(
            superTrend.params.find(parameter => parameter.key === 'multiplier').min,
            0.000001,
        );
        const standardError = catalog.find(entry => entry.id === 'StandardError');
        assert.equal(standardError.painter, undefined);
        assert.equal(standardError.group, 'Statistical');
        assert.equal(standardError.params[0].min, 2);
        const shift = catalog.find(entry => entry.id === 'Shift');
        assert.equal(shift.painter, undefined);
        assert.equal(shift.group, 'Price');
        const sineWave = catalog.find(entry => entry.id === 'SineWave');
        assert.equal(sineWave.painter, undefined);
        assert.equal(sineWave.group, 'Cycle');
        assert.deepEqual(sineWave.outputs, ['sine', 'leadsine']);
        assert.deepEqual(sineWave.scaleRange, { min: -1, max: 1 });
        assert.deepEqual(sineWave.levels, [0]);
        const schaffTrendCycle = catalog.find(entry => entry.id === 'SchaffTrendCycle');
        assert.equal(schaffTrendCycle.painter, undefined);
        assert.equal(schaffTrendCycle.group, 'Cycle');
        assert.deepEqual(schaffTrendCycle.outputs, ['line']);
        assert.deepEqual(schaffTrendCycle.scaleRange, { min: 0, max: 100 });
        assert.deepEqual(schaffTrendCycle.levels, [25, 75]);
        const stochasticK = catalog.find(entry => entry.id === 'StochasticK');
        assert.equal(stochasticK.painter, undefined);
        assert.equal(stochasticK.group, 'Momentum');
        assert.deepEqual(stochasticK.outputs, ['line']);
        assert.deepEqual(stochasticK.scaleRange, { min: 0, max: 100 });
        assert.deepEqual(stochasticK.levels, [20, 80]);
        const t3 = catalog.find(entry => entry.id === 'T3MovingAverage');
        assert.equal(t3.painter, undefined);
        assert.equal(t3.group, 'Trend');
        assert.deepEqual(t3.outputs, ['line']);
        assert.equal(t3.params.find(parameter => parameter.key === 'volumeFactor').min, 0.000001);
        assert.equal(t3.params.find(parameter => parameter.key === 'volumeFactor').max, 0.999999);
        const rSquared = catalog.find(entry => entry.id === 'LinearRegRSquared');
        assert.equal(rSquared.painter, undefined);
        assert.equal(rSquared.group, 'Statistical');
        assert.deepEqual(rSquared.outputs, ['line']);
        assert.deepEqual(rSquared.scaleRange, { min: 0, max: 1 });
        const ppo = catalog.find(entry => entry.id === 'PercentagePriceOscillator');
        assert.equal(ppo.painter, 'ppo-histogram');
        assert.equal(ppo.group, 'Momentum');
        assert.deepEqual(ppo.levels, [0]);
        const pvo = catalog.find(entry => entry.id === 'PercentageVolumeOscillator');
        assert.equal(pvo.painter, undefined);
        assert.equal(pvo.group, 'Volume');
        assert.equal(pvo.pane, 'separate');
        assert.deepEqual(pvo.outputs, ['shortEma', 'longEma', 'pvo']);
        const pvi = catalog.find(entry => entry.id === 'PositiveVolumeIndex');
        assert.equal(pvi.painter, undefined);
        assert.equal(pvi.group, 'Volume');
        assert.deepEqual(pvi.outputs, ['line']);
        const psychologicalLine = catalog.find(entry => entry.id === 'PsychologicalLine');
        assert.equal(psychologicalLine.painter, undefined);
        assert.equal(psychologicalLine.group, 'Momentum');
        assert.equal(psychologicalLine.params[0].default, 20);
        assert.deepEqual(psychologicalLine.scaleRange, { min: 0, max: 1 });
        assert.deepEqual(psychologicalLine.levels, [0.25, 0.75]);
        const priceChannels = catalog.find(entry => entry.id === 'PriceChannels');
        assert.equal(priceChannels.painter, 'band');
        assert.equal(priceChannels.group, 'Price');
        assert.deepEqual(priceChannels.outputs, ['upper', 'lower']);
        const priceVolumeTrend = catalog.find(entry => entry.id === 'PriceVolumeTrend');
        assert.equal(priceVolumeTrend.painter, undefined);
        assert.equal(priceVolumeTrend.group, 'Volume');
        assert.equal(priceVolumeTrend.pane, 'separate');
        assert.deepEqual(priceVolumeTrend.outputs, ['line']);
        const qStick = catalog.find(entry => entry.id === 'QStick');
        assert.equal(qStick.painter, undefined);
        assert.equal(qStick.group, 'Momentum');
        assert.equal(qStick.pane, 'separate');
        assert.deepEqual(qStick.outputs, ['line']);
        assert.deepEqual(qStick.levels, [0]);
        const trough = catalog.find(entry => entry.id === 'Trough');
        assert.equal(trough.painter, undefined);
        assert.equal(trough.group, 'Price');
        assert.equal(trough.pane, 'overlay');
        assert.deepEqual(trough.outputs, ['value']);
        const twap = catalog.find(entry => entry.id === 'TimeWeightedAveragePrice');
        assert.equal(twap.painter, undefined);
        assert.equal(twap.group, 'Price');
        assert.equal(twap.pane, 'overlay');
        assert.deepEqual(twap.outputs, ['line']);
        const vwap = catalog.find(entry => entry.id === 'VolumeWeightedAveragePrice');
        assert.equal(vwap.painter, undefined);
        assert.equal(vwap.group, 'Volume');
        assert.equal(vwap.pane, 'overlay');
        assert.deepEqual(vwap.outputs, ['line']);
        const vwma = catalog.find(entry => entry.id === 'VolumeWeightedMovingAverage');
        assert.equal(vwma.painter, undefined);
        assert.equal(vwma.group, 'Volume');
        assert.equal(vwma.pane, 'overlay');
        assert.deepEqual(vwma.outputs, ['line']);
        const twiggs = catalog.find(entry => entry.id === 'TwiggsMoneyFlow');
        assert.equal(twiggs.painter, undefined);
        assert.equal(twiggs.group, 'Volume');
        assert.equal(twiggs.pane, 'separate');
        assert.deepEqual(twiggs.outputs, ['line']);
        assert.deepEqual(twiggs.scaleRange, { min: -1, max: 1 });
        assert.deepEqual(twiggs.levels, [0]);
        const trueRange = catalog.find(entry => entry.id === 'TrueRange');
        assert.equal(trueRange.painter, undefined);
        assert.equal(trueRange.group, 'Volatility');
        assert.equal(trueRange.pane, 'separate');
        assert.deepEqual(trueRange.outputs, ['line']);
        const tsi = catalog.find(entry => entry.id === 'TrueStrengthIndex');
        assert.equal(tsi.painter, undefined);
        assert.equal(tsi.group, 'Momentum');
        assert.equal(tsi.pane, 'separate');
        assert.deepEqual(tsi.outputs, ['tsi', 'signal']);
        assert.deepEqual(tsi.scaleRange, { min: -100, max: 100 });
        assert.deepEqual(tsi.levels, [-25, 0, 25]);
        const typicalPrice = catalog.find(entry => entry.id === 'TypicalPrice');
        assert.equal(typicalPrice.painter, undefined);
        assert.equal(typicalPrice.group, 'Price');
        assert.equal(typicalPrice.pane, 'overlay');
        assert.deepEqual(typicalPrice.outputs, ['line']);
        const ultimate = catalog.find(entry => entry.id === 'UltimateOscillator');
        assert.equal(ultimate.painter, undefined);
        assert.equal(ultimate.group, 'Momentum');
        assert.equal(ultimate.pane, 'separate');
        assert.deepEqual(ultimate.outputs, ['line']);
        assert.deepEqual(ultimate.scaleRange, { min: 0, max: 100 });
        assert.deepEqual(ultimate.levels, [30, 70]);
        const vhf = catalog.find(entry => entry.id === 'VerticalHorizontalFilter');
        assert.equal(vhf.painter, undefined);
        assert.equal(vhf.group, 'Market Strength');
        assert.equal(vhf.pane, 'separate');
        assert.deepEqual(vhf.outputs, ['line']);
        const vortex = catalog.find(entry => entry.id === 'VortexIndicator');
        assert.equal(vortex.painter, undefined);
        assert.equal(vortex.group, 'Market Strength');
        assert.equal(vortex.pane, 'separate');
        assert.deepEqual(vortex.outputs, ['viPlus', 'viMinus']);
        assert.deepEqual(vortex.levels, [1]);
        const vidya = catalog.find(entry => entry.id === 'Vidya');
        assert.equal(vidya.painter, undefined);
        assert.equal(vidya.group, 'Trend');
        assert.equal(vidya.pane, 'overlay');
        assert.deepEqual(vidya.outputs, ['line']);
        const vma = catalog.find(entry => entry.id === 'VariableMovingAverage');
        assert.equal(vma.painter, undefined);
        assert.equal(vma.group, 'Trend');
        assert.equal(vma.pane, 'overlay');
        assert.deepEqual(vma.outputs, ['line']);
        const waveTrend = catalog.find(entry => entry.id === 'WaveTrendOscillator');
        assert.equal(waveTrend.painter, undefined);
        assert.equal(waveTrend.group, 'Momentum');
        assert.equal(waveTrend.pane, 'separate');
        assert.deepEqual(waveTrend.outputs, ['wt1', 'wt2']);
        const weightedClose = catalog.find(entry => entry.id === 'WeightedClosePrice');
        assert.equal(weightedClose.painter, undefined);
        assert.equal(weightedClose.group, 'Price');
        assert.equal(weightedClose.pane, 'overlay');
        assert.deepEqual(weightedClose.outputs, ['line']);
        const wilder = catalog.find(entry => entry.id === 'WilderMovingAverage');
        assert.equal(wilder.painter, undefined);
        assert.equal(wilder.group, 'Trend');
        assert.equal(wilder.pane, 'overlay');
        assert.deepEqual(wilder.outputs, ['line']);
        const williamsAd = catalog.find(
            entry => entry.id === 'WilliamsAccumulationDistribution',
        );
        assert.equal(williamsAd.painter, undefined);
        assert.equal(williamsAd.group, 'Volume');
        assert.equal(williamsAd.pane, 'separate');
        assert.deepEqual(williamsAd.outputs, ['line']);
        const wvad = catalog.find(
            entry => entry.id === 'WilliamsVariableAccumulationDistribution',
        );
        assert.equal(wvad.painter, undefined);
        assert.equal(wvad.group, 'Volume');
        assert.equal(wvad.pane, 'separate');
        assert.deepEqual(wvad.outputs, ['line']);
        const woodies = catalog.find(entry => entry.id === 'WoodiesCCI');
        assert.equal(woodies.painter, undefined);
        assert.equal(woodies.group, 'Momentum');
        assert.equal(woodies.pane, 'separate');
        assert.deepEqual(woodies.outputs, ['cci', 'signal']);
        assert.deepEqual(woodies.levels, [-100, 0, 100]);
        const zlema = catalog.find(
            entry => entry.id === 'ZeroLagExponentialMovingAverage',
        );
        assert.equal(zlema.painter, undefined);
        assert.equal(zlema.group, 'Trend');
        assert.equal(zlema.pane, 'overlay');
        assert.deepEqual(zlema.outputs, ['line']);
        const donchian = catalog.find(entry => entry.id === 'DonchianChannels');
        assert.equal(donchian.painter, 'band');
        assert.equal(donchian.group, 'Price');
        assert.equal(donchian.pane, 'overlay');
        assert.deepEqual(donchian.outputs, ['upper', 'middle', 'lower']);
        const deMarker = catalog.find(entry => entry.id === 'DeMarker');
        assert.equal(deMarker.painter, undefined);
        assert.equal(deMarker.group, 'Momentum');
        assert.equal(deMarker.pane, 'separate');
        assert.deepEqual(deMarker.outputs, ['line']);
        assert.deepEqual(deMarker.scaleRange, { min: 0, max: 1 });
        assert.deepEqual(deMarker.levels, [0.3, 0.7]);
        const demandIndex = catalog.find(entry => entry.id === 'DemandIndex');
        assert.equal(demandIndex.painter, undefined);
        assert.equal(demandIndex.group, 'Volume');
        assert.equal(demandIndex.pane, 'separate');
        assert.deepEqual(demandIndex.outputs, ['line']);
        assert.deepEqual(demandIndex.levels, [0]);
        const disparityIndex = catalog.find(entry => entry.id === 'DisparityIndex');
        assert.equal(disparityIndex.painter, undefined);
        assert.equal(disparityIndex.group, 'Momentum');
        assert.equal(disparityIndex.pane, 'separate');
        assert.deepEqual(disparityIndex.outputs, ['line']);
        assert.deepEqual(disparityIndex.levels, [0]);
        const dsp = catalog.find(entry => entry.id === 'DetrendedSyntheticPrice');
        assert.equal(dsp.painter, undefined);
        assert.equal(dsp.group, 'Price');
        assert.equal(dsp.pane, 'overlay');
        assert.deepEqual(dsp.outputs, ['line']);
        const dynamicZonesRsi = catalog.find(entry => entry.id === 'DynamicZonesRSI');
        assert.equal(dynamicZonesRsi.painter, undefined);
        assert.equal(dynamicZonesRsi.group, 'Momentum');
        assert.equal(dynamicZonesRsi.pane, 'separate');
        assert.deepEqual(dynamicZonesRsi.outputs, ['line']);
        assert.deepEqual(dynamicZonesRsi.scaleRange, { min: 0, max: 100 });
        const balanceVolume = catalog.find(entry => entry.id === 'BalanceVolume');
        assert.equal(balanceVolume.painter, undefined);
        assert.equal(balanceVolume.group, 'Volume');
        assert.equal(balanceVolume.pane, 'overlay');
        assert.deepEqual(balanceVolume.outputs, ['line']);
        const peak = catalog.find(entry => entry.id === 'Peak');
        assert.equal(peak.painter, undefined);
        assert.equal(peak.group, 'Price');
        assert.equal(peak.pane, 'overlay');
        assert.deepEqual(peak.outputs, ['value']);
        const rateOfChange = catalog.find(entry => entry.id === 'RateOfChange');
        assert.equal(rateOfChange.painter, undefined);
        assert.equal(rateOfChange.group, 'Momentum');
        assert.equal(rateOfChange.pane, 'separate');
        assert.deepEqual(rateOfChange.outputs, ['line']);
        assert.deepEqual(rateOfChange.levels, [0]);
        assert.equal(catalog.find(entry => entry.id === 'BollingerBands').painter, 'band');
        assert.equal(catalog.find(entry => entry.id === 'AdaptivePriceZone').painter, 'band');
        assert.equal(catalog.find(entry => entry.id === 'ChandeKrollStop').painter, 'dual-line');
        assert.equal(catalog.find(entry => entry.id === 'VolumeIndicator').painter, 'volume');
        assert.equal(
            catalog.find(entry => entry.id === 'AwesomeOscillator').painter,
            'directional-histogram',
        );
        const fractals = catalog.find(entry => entry.id === 'Fractals');
        assert.deepEqual(fractals.params[0], { key: 'length', default: 5, min: 3, max: 99, step: 2 });
    });

    it('keeps catalog categories, panes and output schemas aligned with runtime definitions', () => {
        const catalog = getClientCatalog();
        const catalogById = new Map(catalog.map(entry => [entry.id, entry]));
        const groupByCategory = {
            trend: 'Trend',
            momentum: 'Momentum',
            volatility: 'Volatility',
            volume: 'Volume',
            price: 'Price',
            'market-strength': 'Market Strength',
            'support-resistance': 'Price',
            cycle: 'Cycle',
            statistical: 'Statistical',
        };

        for (const definition of getIndicatorDefinitions()) {
            const entry = catalogById.get(definition.id);
            assert.ok(entry, `${definition.id}: missing catalog entry`);
            assert.equal(entry.group, groupByCategory[definition.category], definition.id);
            assert.equal(entry.pane, definition.naturalPane, definition.id);
            assert.deepEqual(
                entry.outputs,
                definition.outputs.map(output => output.id),
                definition.id,
            );
        }

        assert.equal(catalog.length, getIndicatorDefinitions().length);
        assert.equal(catalog.some(entry => entry.id === 'VolumeProfileIndicator'), false);
    });

    it('uses catalog-selected built-ins for bands and volume', () => {
        const catalog = getClientCatalog();

        const bandChart = chartMock();
        const bandRenderer = new IndicatorRenderer(bandChart);
        const bandSettings = catalog.find(entry => entry.id === 'BollingerBands');
        const bandEntry = { type: bandSettings.id, outputNames: ['upper', 'middle', 'lower'], seriesRefs: [] };
        const point = [{ time: 1, value: 10 }];
        bandEntry.seriesRefs = bandRenderer.render(bandEntry, {
            upper: point,
            middle: point,
            lower: point,
        }, null, bandSettings);
        assert.equal(bandEntry.seriesRefs.length, 2);
        assert.deepEqual(bandEntry.seriesRefs.map(series => series.definition.type), ['Band', 'Line']);
        assert.deepEqual(bandEntry.seriesRefs[0].data, [{ time: 1, value: 10, upper: 10, lower: 10 }]);

        const volumeChart = chartMock();
        const volumeRenderer = new IndicatorRenderer(volumeChart);
        const volumeSettings = catalog.find(entry => entry.id === 'VolumeIndicator');
        const volumeEntry = { type: volumeSettings.id, outputNames: ['value'], seriesRefs: [] };
        volumeEntry.seriesRefs = volumeRenderer.render(volumeEntry, [
            { time: 1, value: 100, up: true },
            { time: 2, value: 80, up: false },
        ], null, volumeSettings);
        assert.equal(volumeEntry.seriesRefs[0].definition.type, 'Histogram');
        assert.equal(volumeEntry.seriesRefs[0].data[0].color, '#00c853');
        assert.equal(volumeEntry.seriesRefs[0].data[1].color, '#ff3d57');
    });

    it('streams Volume color-only changes without resetting histogram data', async () => {
        const chart = chartMock();
        const engine = new IndicatorEngine();
        const candles = [
            { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
            { time: 2, open: 11, high: 13, low: 10, close: 12, volume: 150 },
        ];
        engine.setRenderer(new IndicatorRenderer(chart));
        engine.setCandles(candles);
        const entry = engine.add('VolumeIndicator', {}, '__main__');
        const series = entry.seriesRefs[0];

        assert.ok(entry.runtime);
        assert.equal(series.setDataCalls, 1);
        assert.deepEqual(series.data[1], {
            time: 2, value: 150, up: true, color: '#00c853',
        });

        candles[1].close = 10;
        engine.onLiveUpdate();
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(series.setDataCalls, 1);
        assert.equal(series.updateCalls, 1);
        assert.deepEqual(series.data[1], {
            time: 2, value: 150, up: false, color: '#ff3d57',
        });
        assert.deepEqual(engine.getValuesAt(2)[0].values, { value: 150 });

        candles[1].close = 12;
        engine.onLiveUpdate();
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(series.setDataCalls, 1);
        assert.equal(series.updateCalls, 2);
        assert.equal(series.data[1].color, '#00c853');
    });

    it('renders Ichimoku as three lines plus a Senkou cloud band', () => {
        const chart = chartMock();
        const renderer = new IndicatorRenderer(chart);
        const settings = getClientCatalog().find(entry => entry.id === 'Ichimoku');
        const entry = {
            type: 'Ichimoku',
            outputNames: ['tenkan', 'kijun', 'senkouA', 'senkouB', 'chikou'],
            seriesRefs: [],
        };
        const line = value => [{ time: 1, value }];
        const data = {
            tenkan: line(10),
            kijun: line(11),
            senkouA: line(12),
            senkouB: line(8),
            chikou: line(9),
        };

        entry.seriesRefs = renderer.render(entry, data, null, settings);

        assert.deepEqual(entry.seriesRefs.map(series => series.definition.type), ['Line', 'Line', 'Line', 'Band']);
        assert.deepEqual(entry.seriesRefs[3].data, [{ time: 1, value: 10, upper: 12, lower: 8 }]);
        assert.equal(entry.seriesRefs[3].options.positiveFillColor, 'rgba(50,205,50,0.18)');
        assert.deepEqual(renderer.getLastColors(), ['#FF6347', '#1E90FF', '#32CD32', '#FF1493', '#EE82EE']);
    });

    it('resolves legend outputs from the exact rendered seriesData snapshot', () => {
        const chart = chartMock();
        const renderer = new IndicatorRenderer(chart);
        const settings = getClientCatalog().find(entry => entry.id === 'BollingerBands');
        const entry = {
            id: 1,
            type: settings.id,
            params: { length: 20, stdDev: 2 },
            paneId: null,
            outputNames: ['upper', 'middle', 'lower'],
            seriesRefs: [],
            colors: [],
        };
        const line = value => [{ time: 10, value }];
        entry.seriesRefs = renderer.render(entry, {
            upper: line(20), middle: line(15), lower: line(10),
        }, null, settings);

        const engine = new IndicatorEngine();
        engine._indicators = [entry];
        const seriesData = new Map([
            [entry.seriesRefs[0], { time: 10, value: 15.5, upper: 21, lower: 10 }],
            [entry.seriesRefs[1], { time: 10, value: 16 }],
        ]);
        assert.deepEqual(engine.getValuesAt(10, seriesData)[0].values, {
            upper: 21,
            middle: 16,
            lower: 10,
        });
        assert.deepEqual(engine.getValuesAt(11, new Map())[0].values, {
            upper: null,
            middle: null,
            lower: null,
        });
    });

    it('falls back to a line when a configured painter is unavailable', () => {
        const chart = chartMock();
        const renderer = new IndicatorRenderer(chart);
        const entry = { type: 'PluginIndicator', outputNames: ['value'], seriesRefs: [] };
        const originalWarn = console.warn;
        console.warn = () => {};
        try {
            entry.seriesRefs = renderer.render(entry, [{ time: 1, value: 5 }], null, {
                name: 'Plugin',
                painter: 'not-installed',
            });
        } finally {
            console.warn = originalWarn;
        }
        assert.equal(chart.added[0].definition.type, 'Line');
    });

    it('aligns shifted sparse values and legend with the exact pivot bars', () => {
        const engine = new IndicatorEngine();
        const candles = Array.from({ length: 6 }, (_, i) => ({
            time: 1_700_000_000 + i * 60,
            open: 1,
            high: 2,
            low: 0,
            close: 1,
        }));
        engine.setCandles(candles);

        const shifted = engine._applyPointShifts({
            up: [{ time: candles[4].time, value: 5, shift: 2 }],
            down: [{ time: candles[5].time, value: -3, shift: 1 }],
        });
        assert.equal(shifted.up[0].time, candles[2].time);
        assert.equal(shifted.down[0].time, candles[4].time);

        const legend = engine._buildLegendPoints({}, shifted);
        assert.deepEqual(legend, [
            { time: candles[2].time, values: { up: 5 } },
            { time: candles[4].time, values: { down: -3 } },
        ]);

        engine._indicators = [{
            id: 1,
            type: 'Fractals',
            params: { length: 5 },
            paneId: null,
            outputNames: ['up', 'down'],
            colors: ['#32CD32', '#FF3D57'],
            _points: legend,
            _lastValues: legend[legend.length - 1].values,
        }];

        const valuesAt = time => engine.getValuesAt(time)[0].values;
        assert.deepEqual(valuesAt(candles[1].time), { up: null, down: null });
        assert.deepEqual(valuesAt(candles[2].time), { up: 5, down: null });
        assert.deepEqual(valuesAt(candles[3].time), { up: null, down: null });
        assert.deepEqual(valuesAt(candles[4].time), { up: null, down: -3 });
        assert.deepEqual(engine.getValuesAt()[0].values, { up: null, down: -3 });
    });

    it('streams forming Fractals at the pivot candle without full painter resets', async () => {
        const chart = chartMock();
        const engine = new IndicatorEngine();
        const rows = [
            [1, 3], [2, 2], [5, 1], [3, 2], [1, 0],
            [0, -1], [1, -3], [0, -1], [1, 0],
        ];
        const candles = rows.map(([high, low], index) => ({
            time: 1_720_000_000 + index * 60,
            open: (high + low) / 2,
            high,
            low,
            close: (high + low) / 2,
            volume: 0,
        }));
        engine.setRenderer(new IndicatorRenderer(chart));
        engine.setCandles(candles);
        const entry = engine.add('Fractals', { length: 5 }, '__main__');
        const [up, down] = entry.seriesRefs;

        assert.ok(entry.runtime);
        assert.deepEqual(up.data, [{ time: candles[2].time, value: 5 }]);
        assert.deepEqual(down.data, [{ time: candles[6].time, value: -3 }]);
        assert.deepEqual(engine.getValuesAt(candles[6].time)[0].values, {
            up: null,
            down: -3,
        });
        assert.deepEqual(engine.getValuesAt(candles[8].time)[0].values, {
            up: null,
            down: null,
        });

        candles[8].low = -4;
        engine.onLiveUpdate();
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(up.setDataCalls, 1);
        assert.equal(down.setDataCalls, 1);
        assert.equal(down.popCalls, 1);
        assert.deepEqual(down.data, []);
        assert.deepEqual(engine.getValuesAt(candles[6].time)[0].values, {
            up: null,
            down: null,
        });

        candles[8].low = 0;
        engine.onLiveUpdate();
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(down.setDataCalls, 1);
        assert.equal(down.updateCalls, 1);
        assert.deepEqual(down.data, [{ time: candles[6].time, value: -3 }]);
        assert.deepEqual(engine.getValuesAt(candles[6].time)[0].values, {
            up: null,
            down: -3,
        });
    });

    it('streams forming ZigZag pivots at one targetIndex across painter and legend', async () => {
        const chart = chartMock();
        const engine = new IndicatorEngine();
        const closes = [10, 11, 12, 13, 12, 11];
        const candles = closes.map((close, index) => ({
            time: 1_730_000_000 + index * 60,
            open: close,
            high: close,
            low: close,
            close,
            volume: 0,
        }));
        engine.setRenderer(new IndicatorRenderer(chart));
        engine.setCandles(candles);
        const entry = engine.add('ZigZag', { deviation: 0.1 }, '__main__');
        const series = entry.seriesRefs[0];

        assert.ok(entry.runtime);
        assert.deepEqual(series.data, [{ time: candles[2].time, value: 13 }]);
        assert.deepEqual(engine.getValuesAt(candles[2].time)[0].values, { value: 13 });
        assert.deepEqual(engine.getValuesAt(candles[5].time)[0].values, { value: null });

        candles[5].close = 12.9;
        engine.onLiveUpdate();
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(series.setDataCalls, 1);
        assert.equal(series.popCalls, 1);
        assert.deepEqual(series.data, []);
        assert.deepEqual(engine.getValuesAt(candles[2].time)[0].values, { value: null });

        candles[5].close = 11;
        engine.onLiveUpdate();
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(series.setDataCalls, 1);
        assert.equal(series.updateCalls, 1);
        assert.deepEqual(series.data, [{ time: candles[2].time, value: 13 }]);
        assert.deepEqual(engine.getValuesAt(candles[2].time)[0].values, { value: 13 });
    });

    it('does not carry a shifted single-output value into adjacent candles', () => {
        const engine = new IndicatorEngine();
        const candles = Array.from({ length: 5 }, (_, i) => ({
            time: 1_710_000_000 + i * 300,
            open: 10,
            high: 12,
            low: 8,
            close: 10,
        }));
        engine.setCandles(candles);

        const shifted = engine._applyPointShifts([
            { time: candles[4].time, value: 12, shift: 2 },
        ]);
        const points = engine._buildLegendPoints({}, shifted);
        engine._indicators = [{
            id: 1,
            type: 'Peak',
            params: { deviation: 0.001 },
            paneId: null,
            outputNames: ['value'],
            colors: ['#32CD32'],
            _points: points,
            _lastValues: points[0].values,
        }];

        const valuesAt = time => engine.getValuesAt(time)[0].values;
        assert.deepEqual(valuesAt(candles[1].time), { value: null });
        assert.deepEqual(valuesAt(candles[2].time), { value: 12 });
        assert.deepEqual(valuesAt(candles[3].time), { value: null });
        assert.deepEqual(engine.getValuesAt()[0].values, { value: 12 });
    });

    it('keeps Shift rendering and legend on the current candle', () => {
        const chart = chartMock();
        const engine = new IndicatorEngine();
        const candles = Array.from({ length: 6 }, (_, index) => ({
            time: 1_740_000_000 + index * 60,
            open: 20 + index,
            high: 21 + index,
            low: 19 + index,
            close: 20 + index,
            volume: 100,
        }));
        engine.setRenderer(new IndicatorRenderer(chart));
        engine.setCandles(candles);
        const entry = engine.add('Shift', { length: 3 }, '__main__');

        assert.deepEqual(entry.seriesRefs[0].data, candles.slice(3).map((candle) => ({
            time: candle.time,
            value: candle.close,
        })));
        assert.deepEqual(engine.getValuesAt(candles[2].time)[0].values, { line: null });
        assert.deepEqual(engine.getValuesAt(candles[3].time)[0].values, {
            line: candles[3].close,
        });
        assert.deepEqual(engine.getValuesAt(candles[5].time)[0].values, {
            line: candles[5].close,
        });
    });
});
