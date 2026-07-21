// Client-side indicator registry. Maps both StockSharp's canonical PascalCase
// kind names (`SimpleMovingAverage`, `AverageDirectionalIndex`, ...) and their
// short aliases (`sma`, `adx`, ...) to a single calc function — so callers
// can dispatch via whichever name the server catalogue happens to expose
// without duplicating logic.
//
// Lookup is case-insensitive (everything is normalised to lowercase). Adding
// a new indicator: import its calc fn, list it in `IMPLEMENTATIONS` once with
// every name the catalogue might hand back (kind + alias, both case-folded).

// Generated indicator catalog (the picker's metadata). Regenerate, don't hand-edit entries; the
// C# parity test validates it against the StockSharp catalog snapshot.
import CATALOG from '../catalog.json';

import { calcSMA } from './sma.js';
import { calcEMA } from './ema.js';
import { calcRSI } from './rsi.js';
import { calcBollingerBands } from './bb.js';
import { calcMACD } from './macd.js';
import { calcStochastic } from './stochastic.js';
import { calcADX } from './adx.js';
import { calcATR } from './atr.js';
import { calcWMA } from './wma.js';
import { calcVolume } from './volume.js';
import { calcWilliamsR } from './williamsr.js';
import { calcCCI } from './cci.js';
import { calcEnvelope } from './envelope.js';
import { calcAlligator } from './alligator.js';
import { calcParabolicSAR } from './parabolicsar.js';
import { calcIchimoku } from './ichimoku.js';
import { calcAwesomeOscillator as calcAwesome } from './awesomeoscillator.js';
import { calcAroon } from './aroon.js';
import { calcAroonOscillator as calcAroonOsc } from './aroonoscillator.js';
import { calcADL } from './adl.js';
import { calcBalanceOfPower as calcBOP } from './balanceofpower.js';
import { calcDEMA } from './dema.js';
import { calcTEMA } from './tema.js';
import { calcHMA } from './hma.js';
import { calcSMMA } from './smma.js';
import { calcKAMA } from './kama.js';
import { calcZigZag } from './zigzag.js';
import { calcFractals } from './fractals.js';
import { calcTrix } from './trix.js';
import { calcAcceleration } from './acceleration.js';
import { calcALMA } from './alma.js';
import { calcOBV } from './obv.js';
import { calcBearPower } from './bearpower.js';
import { calcBullPower } from './bullpower.js';
import { calcCMF } from './cmf.js';
import { calcChaikinVolatility as calcChaikinVol } from './chaikinvolatility.js';
import { calcCOG } from './cog.js';
import { calcChaikinOscillator as calcChaikinOsc } from './chaikinoscillator.js';
import { calcCMO } from './cmo.js';
import { calcConnorsRSI } from './connorsrsi.js';
import { calcDPO } from './dpo.js';
import { calcDX } from './dx.js';
import { calcEOM } from './eom.js';
import { calcEhlerFisher } from './ehlerfisher.js';
import { calcFastStochastic as calcFastStoch } from './faststochastic.js';
import { calcApprovalFlowIndex as calcAFI } from './approvalflowindex.js';
import { calcAdaptiveLaguerreFilter as calcALF } from './alf.js';
import { calcAdaptivePriceZone as calcAPZ } from './apz.js';
import { calcBollingerPercentB as calcBBPercentB } from './bbpercentb.js';
import { calcBalanceOfMarketPower as calcBOMP } from './bomp.js';
import { calcChoppinessIndex as calcChop } from './chop.js';
import { calcChandeKrollStop as calcChandeKroll } from './chandekrollstop.js';
import { calcConstanceBrownCompositeIndex as calcCBCI } from './cbci.js';
import { calcCompositeMomentum as calcCompMomentum } from './compositemomentum.js';
import { calcDonchian } from './donchian.js';
import { calcDeMarker } from './demarker.js';
import { calcDemandIndex } from './demandindex.js';
import { calcDisparityIndex as calcDisparity } from './disparityindex.js';
import { calcDSP } from './dsp.js';
import { calcDZRSI } from './dzrsi.js';
import { calcElderImpulse } from './elderimpulse.js';
import { calcElderRay } from './elderray.js';
import { calcForceIndex } from './forceindex.js';
import { calcEndpointMovingAverage as calcEndpointMA } from './endpointma.js';
import { calcElliotWaveOscillator as calcEWO } from './ewo.js';
import { calcForecastOscillator as calcForecastOsc } from './forecastoscillator.js';
import { calcFibonacciRetracement as calcFibo } from './fibo.js';
import { calcFractalDimension as calcFractalDim } from './fractaldimension.js';
import { calcGatorOscillator as calcGator } from './gator.js';
import { calcFRAMA } from './frama.js';
import { calcFVE } from './fve.js';
import { calcGRI } from './gri.js';
import { calcGMMA } from './gmma.js';
import { calcHighest } from './highest.js';
import { calcHighLowIndex } from './highlowindex.js';
import { calcHarmonicOscillator as calcHarmonic } from './harmonicoscillator.js';
import { calcHurstExponent as calcHurst } from './hurstexponent.js';
import { calcHistoricalVolatilityRatio as calcHVR } from './hvr.js';
import { calcIntradayIntensityIndex as calcIII } from './iii.js';
import { calcIntradayMomentumIndex as calcIMI } from './imi.js';
import { calcJurikMovingAverage as calcJMA } from './jma.js';
import { calcKalmanFilter as calcKalman } from './kalmanfilter.js';
import { calcKeltnerChannels as calcKeltner } from './keltner.js';
import { calcKaufmanEfficiencyRatio as calcKER } from './ker.js';
import { calcKasePeakOscillator as calcKPO } from './kpo.js';
import { calcKST } from './kst.js';
import { calcKVO } from './kvo.js';
import { calcLinearRegForecast as calcLinRegForecast } from './linregforecast.js';
import { calcLowest } from './lowest.js';
import { calcLunarPhase } from './lunarphase.js';
import { calcLinearReg as calcLinReg } from './linreg.js';
import { calcLinearRegSlope as calcLinRegSlope } from './linregslope.js';
import { calcLaguerreRSI } from './laguerrersi.js';
import { calcMovingAverageCrossover as calcMACross } from './macross.js';
import { calcMovingAverageConvergenceDivergenceSignal as calcMACDSignal } from './macdsignal.js';
import { calcMovingAverageRibbon as calcMARibbon } from './maribbon.js';
import { calcMcClellanOscillator as calcMcClellanOsc } from './mcclellanosc.js';
import { calcMeanDeviation as calcMeanDev } from './meandeviation.js';
import { calcMedian } from './median.js';
import { calcMedianPrice } from './medianprice.js';
import { calcMarketFacilitationIndex as calcMFIMarket } from './mfi_market.js';
import { calcMcGinleyDynamic as calcMcGinley } from './mcginley.js';
import { calcMassIndex } from './massindex.js';
import { calcMarketMeannessIndex as calcMMI } from './mmi.js';
import { calcMoneyFlowIndex as calcMFI } from './mfi.js';
import { calcMomentumOfMovingAverage as calcMoMMA } from './momma.js';
import { calcMomentum } from './momentum.js';
import { calcMomentumPinball as calcMomPinball } from './momentumpinball.js';
import { calcNickRypockTrailingReverse as calcNRTR } from './nrtr.js';
import { calcNVI } from './nvi.js';
import { calcOnBalanceVolume } from './onbalancevolume.js';
import { calcOnBalanceVolumeMean as calcOBVMean } from './obvmean.js';
import { calcOscillatorOfMovingAverage as calcOsMA } from './osma.js';
import { calcOptimalTracking as calcOptTracking } from './optimaltracking.js';
import { calcPeak } from './peak.js';
import { calcPrettyGoodOscillator as calcPGO } from './pgo.js';
import { calcPivotPoints } from './pivotpoints.js';
import { calcPassThrough } from './passthrough.js';
import { calcRateOfChange } from './rateofchange.js';
import { calcRelativeMomentumIndex as calcRMI } from './relativemomentumindex.js';
import { calcRelativeVigorIndex as calcRVI } from './relativevigorindex.js';
import { calcRangeActionVerificationIndex as calcRAVI } from './rangeactionverificationindex.js';
import { calcRankCorrelationIndex as calcRCI } from './rankcorrelationindex.js';
import { calcRainbowCharts as calcRainbow } from './rainbowcharts.js';
import { calcSuperTrend } from './supertrend.js';
import { calcSum } from './sum.js';
import { calcStandardDeviation as calcStdDev } from './standarddeviation.js';
import { calcStandardError as calcStdErr } from './standarderror.js';
import { calcShift } from './shift.js';
import { calcSineWave } from './sinewave.js';
import { calcSchaffTrendCycle as calcSTC } from './schafftrendcycle.js';
import { calcStochasticK as calcStochK } from './stochastick.js';
import { calcT3 } from './t3.js';
import { calcLinearRegRSquared as calcLinRegR2 } from './linregrsquared.js';
import { calcPPO } from './ppo.js';
import { calcPVO } from './pvo.js';
import { calcPositiveVolumeIndex as calcPVI } from './positivevolumeindex.js';
import { calcPsychologicalLine as calcPsyLine } from './psychologicalline.js';
import { calcPriceChannels } from './pricechannels.js';
import { calcPriceVolumeTrend as calcPVT } from './pricevolumetrend.js';
import { calcQStick } from './qstick.js';
import { calcTrough } from './trough.js';
import { calcTWAP } from './twap.js';
import { calcTwiggsMoneyFlow as calcTMF } from './twiggsmoneyflow.js';
import { calcTrueRange as calcTR } from './truerange.js';
import { calcTrueStrengthIndex as calcTSI } from './truestrengthindex.js';
import { calcTypicalPrice as calcTP } from './typicalprice.js';
import { calcUltimateOscillator as calcUO } from './ultimateoscillator.js';
import { calcVHF } from './vhf.js';
import { calcVortex } from './vortex.js';
import { calcVidya } from './vidya.js';
import { calcVMA } from './vma.js';
import { calcVolumeProfile } from './volumeprofile.js';
import { calcVWAP } from './vwap.js';
import { calcVWMA } from './vwma.js';
import { calcWaveTrend as calcWaveTrend } from './wto.js';
import { calcWeightedClosePrice } from './weightedcloseprice.js';
import { calcWilderMovingAverage as calcWilderMA } from './wildermovingaverage.js';
import { calcWilliamsAD } from './williamsad.js';
import { calcWVAD } from './wvad.js';
import { calcWoodiesCCI } from './woodiescci.js';
import { calcZLEMA } from './zlema.js';

// `aliases` lists every name (alias or full kind) the catalogue uses for a
// given calc. First entry is the preferred canonical key — used in
// diagnostics. We dispatch case-insensitively so the catalogue's PascalCase
// kinds (`WilliamsR`, `Alligator`) resolve next to the short aliases.
const IMPLEMENTATIONS = [
    { fn: calcSMA,            aliases: ['sma', 'SimpleMovingAverage'] },
    { fn: calcEMA,            aliases: ['ema', 'ExponentialMovingAverage'] },
    { fn: calcRSI,            aliases: ['rsi', 'RelativeStrengthIndex'] },
    { fn: calcBollingerBands, aliases: ['bb',  'BollingerBands'] },
    // The catalogue currently maps the short `macd` alias to
    // MovingAverageConvergenceDivergenceHistogram (the full three-line MACD
    // with histogram). The bare `MovingAverageConvergenceDivergence` kind
    // is a line-only variant in StockSharp — we serve the same full impl
    // for both because the histogram series is just `macd - signal`, free.
    { fn: calcMACD,           aliases: ['macd', 'MovingAverageConvergenceDivergence',
                                                'MovingAverageConvergenceDivergenceHistogram'] },
    { fn: calcStochastic,     aliases: ['stochastic', 'StochasticOscillator'] },
    { fn: calcADX,            aliases: ['adx', 'AverageDirectionalIndex'] },
    { fn: calcATR,            aliases: ['atr', 'AverageTrueRange'] },
    { fn: calcWMA,            aliases: ['wma', 'WeightedMovingAverage'] },
    { fn: calcVolume,         aliases: ['volume', 'VolumeIndicator'] },
    { fn: calcWilliamsR,      aliases: ['williamsr', 'WilliamsR'] },
    { fn: calcCCI,            aliases: ['cci', 'CommodityChannelIndex'] },
    { fn: calcEnvelope,       aliases: ['envelope', 'Envelope'] },
    { fn: calcAlligator,      aliases: ['alligator', 'Alligator'] },
    { fn: calcParabolicSAR,   aliases: ['psar', 'parabolicsar', 'ParabolicSar'] },
    { fn: calcIchimoku,       aliases: ['ichimoku', 'Ichimoku'] },
    { fn: calcAwesome,        aliases: ['ao', 'awesomeoscillator', 'AwesomeOscillator'] },
    { fn: calcAroon,          aliases: ['aroon', 'Aroon'] },
    { fn: calcAroonOsc,       aliases: ['aroonoscillator', 'AroonOscillator'] },
    { fn: calcADL,            aliases: ['adl', 'AccumulationDistributionLine'] },
    { fn: calcBOP,            aliases: ['balanceofpower', 'BalanceOfPower'] },
    { fn: calcDEMA,           aliases: ['dema', 'DoubleExponentialMovingAverage'] },
    { fn: calcTEMA,           aliases: ['tema', 'TripleExponentialMovingAverage'] },
    { fn: calcHMA,            aliases: ['hma', 'HullMovingAverage'] },
    { fn: calcSMMA,           aliases: ['smma', 'SmoothedMovingAverage'] },
    { fn: calcKAMA,           aliases: ['kama', 'KaufmanAdaptiveMovingAverage'] },
    { fn: calcZigZag,         aliases: ['zigzag', 'ZigZag'] },
    { fn: calcFractals,       aliases: ['fractals', 'Fractals'] },
    { fn: calcTrix,           aliases: ['trix', 'Trix'] },
    { fn: calcAcceleration,   aliases: ['ac', 'acceleration', 'Acceleration'] },
    { fn: calcALMA,           aliases: ['alma', 'ArnaudLegouxMovingAverage'] },
    { fn: calcOBV,            aliases: ['obv', 'balancevolume', 'BalanceVolume'] },
    { fn: calcBearPower,      aliases: ['bearpower', 'BearPower'] },
    { fn: calcBullPower,      aliases: ['bullpower', 'BullPower'] },
    { fn: calcCMF,            aliases: ['cmf', 'ChaikinMoneyFlow'] },
    { fn: calcChaikinVol,     aliases: ['chaikinvolatility', 'ChaikinVolatility'] },
    { fn: calcCOG,            aliases: ['cog', 'cgo', 'CenterOfGravityOscillator'] },
    { fn: calcChaikinOsc,     aliases: ['chaikinoscillator', 'ChaikinOscillator'] },
    { fn: calcCMO,            aliases: ['cmo', 'ChandeMomentumOscillator'] },
    { fn: calcConnorsRSI,     aliases: ['connorsrsi', 'ConnorsRSI'] },
    { fn: calcDPO,            aliases: ['dpo', 'DetrendedPriceOscillator'] },
    { fn: calcDX,             aliases: ['dx', 'DirectionalIndex'] },
    { fn: calcEOM,            aliases: ['eom', 'EaseOfMovement'] },
    { fn: calcEhlerFisher,    aliases: ['ehlerfisher', 'EhlersFisherTransform'] },
    { fn: calcFastStoch,      aliases: ['faststochastic', 'FastStochastic'] },
    { fn: calcAFI,            aliases: ['afi', 'approvalflowindex', 'ApprovalFlowIndex'] },
    { fn: calcALF,            aliases: ['alf', 'AdaptiveLaguerreFilter'] },
    { fn: calcAPZ,            aliases: ['apz', 'AdaptivePriceZone'] },
    { fn: calcBBPercentB,     aliases: ['bbpercentb', 'BollingerPercentB'] },
    { fn: calcBOMP,           aliases: ['bomp', 'BalanceOfMarketPower'] },
    { fn: calcChop,           aliases: ['chop', 'ChoppinessIndex'] },
    { fn: calcChandeKroll,    aliases: ['chandekrollstop', 'ChandeKrollStop'] },
    { fn: calcCBCI,           aliases: ['cbci', 'ConstanceBrownCompositeIndex'] },
    { fn: calcCompMomentum,   aliases: ['compositemomentum', 'CompositeMomentum'] },
    { fn: calcDonchian,       aliases: ['donchian', 'donchianchannels', 'DonchianChannels'] },
    { fn: calcDeMarker,       aliases: ['demarker', 'DeMarker'] },
    { fn: calcDemandIndex,    aliases: ['demandindex', 'DemandIndex'] },
    { fn: calcDisparity,      aliases: ['disparityindex', 'DisparityIndex'] },
    { fn: calcDSP,            aliases: ['dsp', 'DetrendedSyntheticPrice'] },
    { fn: calcDZRSI,          aliases: ['dzrsi', 'DynamicZonesRSI'] },
    { fn: calcElderImpulse,   aliases: ['elderimpulse', 'ElderImpulseSystem'] },
    { fn: calcElderRay,       aliases: ['elderray', 'ElderRay'] },
    // ElderForceIndex.cs and ForceIndex.cs are functionally identical;
    // one calc serves both aliases (see forceindex.js header).
    { fn: calcForceIndex,     aliases: ['forceindex', 'ForceIndex', 'elderforceindex', 'ElderForceIndex'] },
    { fn: calcEndpointMA,     aliases: ['endpointma', 'EndpointMovingAverage'] },
    { fn: calcEWO,            aliases: ['ewo', 'ElliotWaveOscillator'] },
    { fn: calcForecastOsc,    aliases: ['forecastoscillator', 'ForecastOscillator'] },
    { fn: calcFibo,           aliases: ['fibo', 'FibonacciRetracement'] },
    { fn: calcFractalDim,     aliases: ['fractaldimension', 'FractalDimension'] },
    { fn: calcGator,          aliases: ['gator', 'gatoroscillator', 'GatorOscillator'] },
    { fn: calcFRAMA,          aliases: ['frama', 'FractalAdaptiveMovingAverage'] },
    { fn: calcFVE,            aliases: ['fve', 'FiniteVolumeElement'] },
    { fn: calcGRI,            aliases: ['gri', 'GopalakrishnanRangeIndex'] },
    { fn: calcGMMA,           aliases: ['gmma', 'GuppyMultipleMovingAverage'] },
    { fn: calcHighest,        aliases: ['highest', 'Highest'] },
    { fn: calcHighLowIndex,   aliases: ['highlowindex', 'HighLowIndex'] },
    { fn: calcHarmonic,       aliases: ['harmonic', 'harmonicoscillator', 'HarmonicOscillator'] },
    { fn: calcHurst,          aliases: ['hurst', 'hurstexponent', 'HurstExponent'] },
    { fn: calcHVR,            aliases: ['hvr', 'HistoricalVolatilityRatio'] },
    { fn: calcIII,            aliases: ['iii', 'IntradayIntensityIndex'] },
    { fn: calcIMI,            aliases: ['imi', 'IntradayMomentumIndex'] },
    { fn: calcJMA,            aliases: ['jma', 'JurikMovingAverage'] },
    { fn: calcKalman,         aliases: ['kalman', 'kalmanfilter', 'KalmanFilter'] },
    { fn: calcKeltner,        aliases: ['keltner', 'keltnerchannels', 'KeltnerChannels'] },
    { fn: calcKER,            aliases: ['ker', 'KaufmanEfficiencyRatio'] },
    { fn: calcKPO,            aliases: ['kpo', 'KasePeakOscillator'] },
    { fn: calcKST,            aliases: ['kst', 'KnowSureThing'] },
    { fn: calcKVO,            aliases: ['kvo', 'KlingerVolumeOscillator'] },
    { fn: calcLinRegForecast, aliases: ['linregforecast', 'LinearRegressionForecast'] },
    { fn: calcLowest,         aliases: ['lowest', 'Lowest'] },
    { fn: calcLunarPhase,     aliases: ['lunarphase', 'LunarPhase'] },
    { fn: calcLinReg,         aliases: ['linreg', 'LinearReg'] },
    { fn: calcLinRegSlope,    aliases: ['linregslope', 'LinearRegSlope'] },
    { fn: calcLaguerreRSI,    aliases: ['laguerrersi', 'LaguerreRSI'] },
    { fn: calcMACross,        aliases: ['macross', 'movingaveragecrossover', 'MovingAverageCrossover'] },
    { fn: calcMACDSignal,     aliases: ['macdsignal', 'MovingAverageConvergenceDivergenceSignal'] },
    { fn: calcMARibbon,       aliases: ['maribbon', 'movingaverageribbon', 'MovingAverageRibbon'] },
    { fn: calcMcClellanOsc,   aliases: ['mcclellanosc', 'mcclellanoscillator', 'McClellanOscillator'] },
    { fn: calcMeanDev,        aliases: ['meandeviation', 'MeanDeviation'] },
    { fn: calcMedian,         aliases: ['median', 'Median'] },
    { fn: calcMedianPrice,    aliases: ['medianprice', 'MedianPrice'] },
    { fn: calcMFIMarket,      aliases: ['marketfacilitationindex', 'MarketFacilitationIndex'] },
    { fn: calcMcGinley,       aliases: ['mcginley', 'mcginleydynamic', 'McGinleyDynamic'] },
    { fn: calcMassIndex,      aliases: ['massindex', 'MassIndex'] },
    { fn: calcMMI,            aliases: ['mmi', 'marketmeannessindex', 'MarketMeannessIndex'] },
    { fn: calcMFI,            aliases: ['mfi', 'moneyflowindex', 'MoneyFlowIndex'] },
    { fn: calcMoMMA,          aliases: ['momma', 'momentumofmovingaverage', 'MomentumOfMovingAverage'] },
    { fn: calcMomentum,       aliases: ['momentum', 'Momentum'] },
    { fn: calcMomPinball,     aliases: ['momentumpinball', 'MomentumPinball'] },
    { fn: calcNRTR,           aliases: ['nrtr', 'NickRypockTrailingReverse'] },
    { fn: calcNVI,            aliases: ['nvi', 'negativevolumeindex', 'NegativeVolumeIndex'] },
    { fn: calcOnBalanceVolume,aliases: ['onbalancevolume', 'OnBalanceVolume'] },
    { fn: calcOBVMean,        aliases: ['obvmean', 'onbalancevolumemean', 'OnBalanceVolumeMean'] },
    { fn: calcOsMA,           aliases: ['osma', 'oscillatorofmovingaverage', 'OscillatorOfMovingAverage'] },
    { fn: calcOptTracking,    aliases: ['optimaltracking', 'OptimalTracking'] },
    { fn: calcPeak,           aliases: ['peak', 'Peak'] },
    { fn: calcPGO,            aliases: ['pgo', 'prettygoodoscillator', 'PrettyGoodOscillator'] },
    { fn: calcPivotPoints,    aliases: ['pivotpoints', 'PivotPoints'] },
    { fn: calcPassThrough,    aliases: ['passthrough', 'PassThroughIndicator'] },
    { fn: calcRateOfChange,   aliases: ['roc', 'rateofchange', 'RateOfChange'] },
    { fn: calcRMI,            aliases: ['rmi', 'relativemomentumindex', 'RelativeMomentumIndex'] },
    { fn: calcRVI,            aliases: ['rvi', 'relativevigorindex', 'RelativeVigorIndex'] },
    { fn: calcRAVI,           aliases: ['ravi', 'rangeactionverificationindex', 'RangeActionVerificationIndex'] },
    { fn: calcRCI,            aliases: ['rci', 'rankcorrelationindex', 'RankCorrelationIndex'] },
    { fn: calcRainbow,        aliases: ['rainbow', 'rainbowcharts', 'RainbowCharts'] },
    { fn: calcSuperTrend,     aliases: ['supertrend', 'SuperTrend'] },
    { fn: calcSum,            aliases: ['sum', 'Sum'] },
    { fn: calcStdDev,         aliases: ['stddev', 'standarddeviation', 'StandardDeviation'] },
    { fn: calcStdErr,         aliases: ['stderr', 'standarderror', 'StandardError'] },
    { fn: calcShift,          aliases: ['shift', 'Shift'] },
    { fn: calcSineWave,       aliases: ['sinewave', 'SineWave'] },
    { fn: calcSTC,            aliases: ['stc', 'schafftrendcycle', 'SchaffTrendCycle'] },
    { fn: calcStochK,         aliases: ['stochastick', 'StochasticK'] },
    { fn: calcT3,             aliases: ['t3', 'T3MovingAverage'] },
    { fn: calcLinRegR2,       aliases: ['rsquared', 'linregrsquared', 'LinearRegRSquared'] },
    // PPO: same calc serves all three catalogue names (line/histogram/signal),
    // like the MACD entry — the calc returns {ppo, signal, histogram}.
    { fn: calcPPO,            aliases: ['ppo', 'PercentagePriceOscillator',
                                                'PercentagePriceOscillatorHistogram',
                                                'PercentagePriceOscillatorSignal'] },
    { fn: calcPVO,            aliases: ['pvo', 'PercentageVolumeOscillator'] },
    { fn: calcPVI,            aliases: ['pvi', 'positivevolumeindex', 'PositiveVolumeIndex'] },
    { fn: calcPsyLine,        aliases: ['psy', 'psychologicalline', 'PsychologicalLine'] },
    { fn: calcPriceChannels,  aliases: ['pc', 'pricechannels', 'PriceChannels'] },
    { fn: calcPVT,            aliases: ['pvt', 'pricevolumetrend', 'PriceVolumeTrend'] },
    { fn: calcQStick,         aliases: ['qstick', 'QStick'] },
    { fn: calcTrough,         aliases: ['trough', 'Trough'] },
    { fn: calcTWAP,           aliases: ['twap', 'timeweightedaverageprice', 'TimeWeightedAveragePrice'] },
    { fn: calcTMF,            aliases: ['tmf', 'twiggsmoneyflow', 'TwiggsMoneyFlow'] },
    { fn: calcTR,             aliases: ['tr', 'truerange', 'TrueRange'] },
    { fn: calcTSI,            aliases: ['tsi', 'truestrengthindex', 'TrueStrengthIndex'] },
    { fn: calcTP,             aliases: ['tp', 'typicalprice', 'TypicalPrice'] },
    { fn: calcUO,             aliases: ['uo', 'ultimateoscillator', 'UltimateOscillator'] },
    { fn: calcVHF,            aliases: ['vhf', 'verticalhorizontalfilter', 'VerticalHorizontalFilter'] },
    { fn: calcVortex,         aliases: ['vi', 'vortex', 'vortexindicator', 'VortexIndicator'] },
    { fn: calcVidya,          aliases: ['vidya', 'Vidya'] },
    { fn: calcVMA,            aliases: ['vma', 'variablemovingaverage', 'VariableMovingAverage'] },
    { fn: calcVolumeProfile,  aliases: ['vp', 'volumeprofile', 'volumeprofileindicator', 'VolumeProfileIndicator'] },
    { fn: calcVWAP,           aliases: ['vwap', 'volumeweightedaverageprice', 'VolumeWeightedAveragePrice'] },
    { fn: calcVWMA,           aliases: ['vwma', 'volumeweightedmovingaverage', 'VolumeWeightedMovingAverage'] },
    { fn: calcWaveTrend,      aliases: ['wto', 'wavetrend', 'wavetrendoscillator', 'WaveTrendOscillator'] },
    { fn: calcWeightedClosePrice, aliases: ['wcp', 'weightedcloseprice', 'WeightedClosePrice'] },
    { fn: calcWilderMA,       aliases: ['wilderma', 'wildermovingaverage', 'WilderMovingAverage'] },
    { fn: calcWilliamsAD,     aliases: ['wad', 'williamsad', 'williamsaccumulationdistribution', 'WilliamsAccumulationDistribution'] },
    { fn: calcWVAD,           aliases: ['wvad', 'williamsvariableaccumulationdistribution', 'WilliamsVariableAccumulationDistribution'] },
    { fn: calcWoodiesCCI,     aliases: ['wcci', 'woodiescci', 'WoodiesCCI'] },
    { fn: calcZLEMA,          aliases: ['zlema', 'zerolagexponentialmovingaverage', 'ZeroLagExponentialMovingAverage'] },
];

export const registry: Record<string, (candles: any, params: any) => any> = {};
for (const impl of IMPLEMENTATIONS) {
    for (const name of impl.aliases) {
        registry[name.toLowerCase()] = impl.fn;
    }
}

export function getCalcFn(kind: string) {
    if (typeof kind !== 'string') return undefined;
    return registry[kind.toLowerCase()];
}

// English label of a param/output/indicator, derived from its camelCase key. This IS the i18n
// key: T.t(humanize(key)) resolves it against the injected dictionary, falling back to English.
// So no separate `label` is stored — the key is the single source for identifier AND display.
export function humanize(key: string): string {
    return String(key)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase());
}


// The indicator picker's single source of truth is the JSON catalog (../catalog.json): one
// self-describing entry per client-computable indicator. `serverKind`/`id` is the canonical kind,
// which resolves back to the calc fn through the registry; params carry the calc's own keys
// (labels are derived via humanize()+T.t at render time). Edit the JSON, not code, to tune meta;
// the C# parity test (tests/parity.test.js) checks it against the StockSharp catalog snapshot.
export function getClientCatalog(): any[] {
    return (CATALOG as any[]).map((e) => ({
        id: e.kind,
        serverKind: e.kind,   // resolves to the calc fn via the registry (kind is an alias)
        name: e.name,
        fullName: e.name,
        group: e.group,
        pane: e.pane,
        params: e.params,
        outputs: e.outputs,
        painter: (e as any).painter,
        scaleRange: e.scaleRange,
        levels: e.levels,
    }));
}

export function apply(kind: string, candles: any, params: any) {
    const fn = getCalcFn(kind);
    if (!fn) throw new Error(`Indicator not implemented client-side: ${kind}`);
    return fn(candles, params || {});
}
