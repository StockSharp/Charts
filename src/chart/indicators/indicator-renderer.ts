// Indicator Renderer — maps computed indicator data to chart series
import { IndicatorSettings } from './indicator-settings.js';

export class IndicatorRenderer {
    _mainChart: any;
    _lastColors: string[];

    constructor(mainChart) {
        this._mainChart = mainChart;
        this._lastColors = [];
    }

    setMainChart(chart) {
        this._mainChart = chart;
    }

    getLastColors() {
        return this._lastColors.slice();
    }

    render(entry, data, paneChart, settings) {
        const chart = paneChart || this._mainChart;
        if (!chart || !data) return [];

        this._lastColors = [];
        const series: any[] = [];

        switch (entry.type) {
            case 'SMA':
            case 'EMA': {
                const color = IndicatorSettings.getNextColor();
                this._lastColors.push(color);
                const s = chart.addSeries(SSChart.LineSeries, { color, lineWidth: 2, title: entry.type + '(' + entry.params.period + ')' });
                s.setData(data);
                series.push(s);
                break;
            }

            case 'BollingerBands':
            case 'Envelope': {
                const c1 = IndicatorSettings.getNextColor();
                const c2 = IndicatorSettings.getNextColor();
                this._lastColors.push(c1, c2);
                const upper = chart.addSeries(SSChart.LineSeries, { color: c1, lineWidth: 1, lineStyle: 2, title: 'Upper' });
                const mid = chart.addSeries(SSChart.LineSeries, { color: c2, lineWidth: 2, title: 'Middle' });
                const lower = chart.addSeries(SSChart.LineSeries, { color: c1, lineWidth: 1, lineStyle: 2, title: 'Lower' });
                upper.setData(data.upper);
                mid.setData(data.middle);
                lower.setData(data.lower);
                series.push(upper, mid, lower);
                break;
            }

            case 'MACD':
            case 'PPO': {
                const cMacd = IndicatorSettings.getNextColor();
                const cSig = IndicatorSettings.getNextColor();
                const cHist = IndicatorSettings.getNextColor();
                this._lastColors.push(cMacd, cSig, cHist);
                const macdKey = entry.type === 'MACD' ? 'macd' : 'ppo';
                const hist = chart.addSeries(SSChart.HistogramSeries, { title: 'Histogram', priceScaleId: 'right' });
                const macdLine = chart.addSeries(SSChart.LineSeries, { color: cMacd, lineWidth: 2, title: entry.type });
                const sigLine = chart.addSeries(SSChart.LineSeries, { color: cSig, lineWidth: 1, title: 'Signal' });
                hist.setData(data.histogram);
                macdLine.setData(data[macdKey]);
                sigLine.setData(data.signal);
                series.push(hist, macdLine, sigLine);

                // Apply scale range for pane
                if (settings.scaleRange) {
                    chart.priceScale('right').applyOptions({
                        autoScale: true,
                        scaleMargins: { top: 0.1, bottom: 0.1 },
                    });
                }
                break;
            }

            case 'RSI': {
                const color = IndicatorSettings.getNextColor();
                this._lastColors.push(color);
                const s = chart.addSeries(SSChart.LineSeries, { color, lineWidth: 2, title: 'RSI' });
                s.setData(data);
                series.push(s);

                // Add level lines
                if (settings.levels) {
                    for (const lv of settings.levels) {
                        s.createPriceLine({ price: lv, color: 'rgba(107,122,141,0.4)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
                    }
                }

                chart.priceScale('right').applyOptions({
                    autoScale: false,
                    scaleMargins: { top: 0.05, bottom: 0.05 },
                });
                // Set visible range manually
                chart.applyOptions({
                    rightPriceScale: { autoScale: true },
                });
                break;
            }

            case 'Stochastic':
            case 'RVI': {
                // StockSharp ships complex indicators with variable inner
                // names across versions/locales — honour whatever the
                // catalog reported rather than pinning `data.k/data.d` or
                // `data.rvi/data.signal` client-side.
                const outputs = (entry.outputNames && entry.outputNames.length) ? entry.outputNames : ['value'];
                const palette = outputs.map(() => IndicatorSettings.getNextColor());
                this._lastColors.push(...palette);
                for (let i = 0; i < outputs.length; i++) {
                    const s = chart.addSeries(SSChart.LineSeries, {
                        color: palette[i],
                        lineWidth: i === 0 ? 2 : 1,
                        lineStyle: i === 0 ? 0 : 2,
                        title: outputs[i],
                    });
                    s.setData(data[outputs[i]] || []);
                    series.push(s);
                }
                if (entry.type === 'Stochastic' && settings.levels && series[0]) {
                    for (const lv of settings.levels) {
                        series[0].createPriceLine({ price: lv, color: 'rgba(107,122,141,0.4)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
                    }
                }
                break;
            }

            case 'ADX': {
                // Server emits ADX as a single output (the smoothed Wilder MA
                // line) — `_historyToRendererShape` returns a flat array for
                // single-output indicators. Tolerate both shapes: a one-line
                // ADX (current server) and a future multi-line ADX with +DI/
                // -DI broken out (object keyed by output name) without code
                // changes here.
                const outputs = (entry.outputNames && entry.outputNames.length) ? entry.outputNames : ['value'];
                const palette = outputs.map(() => IndicatorSettings.getNextColor());
                this._lastColors.push(...palette);
                for (let i = 0; i < outputs.length; i++) {
                    const s = chart.addSeries(SSChart.LineSeries, {
                        color: palette[i],
                        lineWidth: i === outputs.length - 1 ? 2 : 1,
                        title: outputs[i],
                    });
                    const seriesData = Array.isArray(data) ? (i === 0 ? data : []) : (data[outputs[i]] || []);
                    s.setData(seriesData);
                    series.push(s);
                }
                break;
            }

            case 'Alligator':
            case 'Ichimoku': {
                // Render whatever inner-series the server reports —
                // StockSharp's inner indicator names (tenkan/kijun/...,
                // jaw/teeth/lips) don't always survive localization or
                // version bumps, so keying off entry.outputNames keeps us
                // in sync with the catalog.
                const palette = entry.type === 'Ichimoku'
                    ? ['#FF6347', '#1E90FF', '#32CD32', '#FF1493', '#EE82EE']  // Tenkan/Kijun/SenkouA/SenkouB/Chikou
                    : ['#1E90FF', '#FF0000', '#32CD32'];                      // Jaw/Teeth/Lips
                const outputs = (entry.outputNames && entry.outputNames.length) ? entry.outputNames : ['value'];
                this._lastColors.push(...outputs.map((_, i) => palette[i] || IndicatorSettings.getNextColor()));
                for (let i = 0; i < outputs.length; i++) {
                    const s = chart.addSeries(SSChart.LineSeries, {
                        color: palette[i] || this._lastColors[this._lastColors.length - outputs.length + i],
                        lineWidth: 1,
                        lineStyle: outputs[i].toLowerCase().includes('chikou') ? 2 : 0,
                        title: outputs[i],
                    });
                    s.setData(data[outputs[i]] || []);
                    series.push(s);
                }
                break;
            }

            case 'ParabolicSAR': {
                const color = IndicatorSettings.getNextColor();
                this._lastColors.push(color);
                const s = chart.addSeries(SSChart.LineSeries, {
                    color,
                    lineWidth: 0,
                    lineVisible: false,
                    title: 'SAR',
                    crosshairMarkerRadius: 4,
                    pointMarkersVisible: true,
                    pointMarkersRadius: 3,
                });
                s.setData(data);
                series.push(s);
                break;
            }

            case 'ZigZag': {
                const color = IndicatorSettings.getNextColor();
                this._lastColors.push(color);
                const s = chart.addSeries(SSChart.LineSeries, { color, lineWidth: 2, title: 'ZigZag' });
                s.setData(data);
                series.push(s);
                break;
            }

            case 'Fractals': {
                const cUp = '#32CD32';
                const cDown = '#FF3D57';
                this._lastColors.push(cUp, cDown);
                const upSeries = chart.addSeries(SSChart.LineSeries, {
                    color: cUp,
                    lineWidth: 0,
                    lineVisible: false,
                    title: 'Fractal Up',
                    pointMarkersVisible: true,
                    pointMarkersRadius: 4,
                    crosshairMarkerRadius: 4,
                });
                const downSeries = chart.addSeries(SSChart.LineSeries, {
                    color: cDown,
                    lineWidth: 0,
                    lineVisible: false,
                    title: 'Fractal Down',
                    pointMarkersVisible: true,
                    pointMarkersRadius: 4,
                    crosshairMarkerRadius: 4,
                });
                upSeries.setData(data.up);
                downSeries.setData(data.down);
                series.push(upSeries, downSeries);
                break;
            }

            case 'GatorOscillator': {
                const hist1 = chart.addSeries(SSChart.HistogramSeries, { title: 'Upper', priceScaleId: 'right' });
                const hist2 = chart.addSeries(SSChart.HistogramSeries, { title: 'Lower', priceScaleId: 'right' });
                hist1.setData(data.upper);
                hist2.setData(data.lower);
                this._lastColors.push('#00c853', '#ff3d57');
                series.push(hist1, hist2);
                break;
            }

            case 'Volume': {
                const hist = chart.addSeries(SSChart.HistogramSeries, {
                    title: 'Volume',
                    priceFormat: { type: 'volume' },
                    priceScaleId: 'right',
                });
                hist.setData(data);
                this._lastColors.push('#4a9eff');
                series.push(hist);
                break;
            }

            default: {
                // Generic fallback for any indicator the catalog surfaces that
                // doesn't have a dedicated case above — render every output
                // as a plain line with cycling colors. Works for both
                // single-output ({time,value}[]) and multi-output
                // ({upper:[...], middle:[...], lower:[...]}) shapes.
                const outputs = (entry.outputNames && entry.outputNames.length) ? entry.outputNames : ['value'];
                if (outputs.length === 1 && Array.isArray(data)) {
                    const color = IndicatorSettings.getNextColor();
                    this._lastColors.push(color);
                    const s = chart.addSeries(SSChart.LineSeries, { color, lineWidth: 2, title: entry.type });
                    s.setData(data);
                    series.push(s);
                } else {
                    for (const name of outputs) {
                        const color = IndicatorSettings.getNextColor();
                        this._lastColors.push(color);
                        const s = chart.addSeries(SSChart.LineSeries, { color, lineWidth: 1, title: name });
                        s.setData(Array.isArray(data) ? data : (data[name] || []));
                        series.push(s);
                    }
                }
                break;
            }
        }

        return series;
    }

    update(entry, data, paneChart, settings) {
        if (!data || !entry.seriesRefs.length) return;

        switch (entry.type) {
            case 'SMA':
            case 'EMA':
                entry.seriesRefs[0].setData(data);
                break;

            case 'BollingerBands':
            case 'Envelope':
                entry.seriesRefs[0].setData(data.upper);
                entry.seriesRefs[1].setData(data.middle);
                entry.seriesRefs[2].setData(data.lower);
                break;

            case 'MACD':
            case 'PPO': {
                const macdKey = entry.type === 'MACD' ? 'macd' : 'ppo';
                entry.seriesRefs[0].setData(data.histogram);
                entry.seriesRefs[1].setData(data[macdKey]);
                entry.seriesRefs[2].setData(data.signal);
                break;
            }

            case 'RSI':
                entry.seriesRefs[0].setData(data);
                break;

            case 'Stochastic':
                entry.seriesRefs[0].setData(data.k);
                entry.seriesRefs[1].setData(data.d);
                break;

            case 'RVI':
                entry.seriesRefs[0].setData(data.rvi);
                entry.seriesRefs[1].setData(data.signal);
                break;

            case 'ADX':
                entry.seriesRefs[0].setData(data.adx);
                entry.seriesRefs[1].setData(data.plusDI);
                entry.seriesRefs[2].setData(data.minusDI);
                break;

            case 'Alligator':
                entry.seriesRefs[0].setData(data.jaw);
                entry.seriesRefs[1].setData(data.teeth);
                entry.seriesRefs[2].setData(data.lips);
                break;

            case 'Ichimoku':
                entry.seriesRefs[0].setData(data.tenkan);
                entry.seriesRefs[1].setData(data.kijun);
                entry.seriesRefs[2].setData(data.senkouA);
                entry.seriesRefs[3].setData(data.senkouB);
                entry.seriesRefs[4].setData(data.chikou);
                break;

            case 'ParabolicSAR':
            case 'ZigZag':
                entry.seriesRefs[0].setData(data);
                break;

            case 'Fractals':
                entry.seriesRefs[0].setData(data.up);
                entry.seriesRefs[1].setData(data.down);
                break;

            case 'GatorOscillator':
                entry.seriesRefs[0].setData(data.upper);
                entry.seriesRefs[1].setData(data.lower);
                break;

            case 'Volume':
                entry.seriesRefs[0].setData(data);
                break;

            default: {
                const outputs = (entry.outputNames && entry.outputNames.length) ? entry.outputNames : ['value'];
                if (outputs.length === 1 && Array.isArray(data)) {
                    entry.seriesRefs[0].setData(data);
                } else {
                    for (let i = 0; i < outputs.length && i < entry.seriesRefs.length; i++) {
                        entry.seriesRefs[i].setData(Array.isArray(data) ? data : (data[outputs[i]] || []));
                    }
                }
                break;
            }
        }
    }

    removeSeries(entry) {
        const chart = entry.paneId && window._chartPaneManager
            ? window._chartPaneManager.getChart(entry.paneId)
            : this._mainChart;

        if (!chart) return;

        for (const s of entry.seriesRefs) {
            try { chart.removeSeries(s); } catch (e) { /* already removed */ }
        }
        entry.seriesRefs = [];
    }
}
