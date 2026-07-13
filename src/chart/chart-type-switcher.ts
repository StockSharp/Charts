// Chart Type Switcher — switch between Candle/Bar/Line/Area
export class ChartTypeSwitcher {
    _chart: any;
    _currentSeries: any;
    _currentType: string;
    _volumeSeries: any;
    _rawCandles: any[];
    _lastHA: { open: number; close: number } | null = null;

    constructor() {
        this._chart = null;
        this._currentSeries = null;
        this._currentType = 'candle';
        this._volumeSeries = null;
        this._rawCandles = [];
    }

    init(chart, candleSeries, volumeSeries) {
        this._chart = chart;
        this._currentSeries = candleSeries;
        this._volumeSeries = volumeSeries;
    }

    setRawCandles(candles) {
        this._rawCandles = candles || [];
    }

    switchType(type) {
        if (!this._chart || type === this._currentType) return this._currentSeries;

        // Remove current series
        try { this._chart.removeSeries(this._currentSeries); } catch (e) { }

        // Same dynamic-precision formatter as chart-widget. Без него после
        // переключения типа графика ось Y возвращается к default precision=2
        // ("0.44" вместо "0.4438") — пересоздание series в lightweight-charts
        // сбрасывает priceFormat на дефолт.
        const priceFormat = {
            type: 'custom',
            minMove: 0.0001,
            formatter: (p: number) => {
                if (p == null || !isFinite(p)) return '';
                const a = Math.abs(p);
                let prec = 2;
                if (a < 1) prec = 4;
                if (a < 0.1) prec = 5;
                if (a < 0.001) prec = 6;
                if (a >= 1000) prec = 1;
                if (a >= 10000) prec = 0;
                return p.toFixed(prec);
            },
        };

        // Create new series. v5: per-shape factories replaced by
        // chart.addSeries(SeriesType, options).
        let newSeries;
        switch (type) {
            case 'candle':
                newSeries = this._chart.addSeries(SSChart.CandlestickSeries, {
                    upColor: '#00c853',
                    downColor: '#ff3d57',
                    borderDownColor: '#ff3d57',
                    borderUpColor: '#00c853',
                    wickDownColor: '#ff3d57',
                    wickUpColor: '#00c853',
                    priceFormat,
                });
                newSeries.setData(this._rawCandles.map(c => ({
                    time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
                })));
                break;

            case 'bar':
                newSeries = this._chart.addSeries(SSChart.BarSeries, {
                    upColor: '#00c853',
                    downColor: '#ff3d57',
                    priceFormat,
                });
                newSeries.setData(this._rawCandles.map(c => ({
                    time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
                })));
                break;

            case 'line':
                newSeries = this._chart.addSeries(SSChart.LineSeries, {
                    color: '#4a9eff',
                    lineWidth: 2,
                    priceFormat,
                });
                newSeries.setData(this._rawCandles.map(c => ({
                    time: c.time, value: c.close,
                })));
                break;

            case 'area':
                newSeries = this._chart.addSeries(SSChart.AreaSeries, {
                    topColor: 'rgba(74,158,255,0.3)',
                    bottomColor: 'rgba(74,158,255,0.02)',
                    lineColor: '#4a9eff',
                    lineWidth: 2,
                    priceFormat,
                });
                newSeries.setData(this._rawCandles.map(c => ({
                    time: c.time, value: c.close,
                })));
                break;

            case 'heikin':
                newSeries = this._chart.addSeries(SSChart.CandlestickSeries, {
                    upColor: '#00c853',
                    downColor: '#ff3d57',
                    borderDownColor: '#ff3d57',
                    borderUpColor: '#00c853',
                    wickDownColor: '#ff3d57',
                    wickUpColor: '#00c853',
                    priceFormat,
                });
                newSeries.setData(this._computeHeikinAshi(this._rawCandles));
                break;

            case 'renko':
                newSeries = this._chart.addSeries(SSChart.RenkoSeries, { upColor: '#00c853', downColor: '#ff3d57', priceFormat });
                newSeries.setData(this._rawCandles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
                break;

            case 'pf':
                newSeries = this._chart.addSeries(SSChart.PointFigureSeries, { upColor: '#00c853', downColor: '#ff3d57', reversal: 2, priceFormat });
                newSeries.setData(this._rawCandles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
                break;

            case 'cluster':
                newSeries = this._chart.addSeries(SSChart.ClusterSeries, { color: 'rgba(74,158,255,0.55)', priceFormat });
                newSeries.setData(this._rawCandles.map(c => ({ time: c.time, high: c.high, low: c.low, levels: c.levels })));
                break;

            case 'box':
                newSeries = this._chart.addSeries(SSChart.BoxSeries2, { priceFormat });
                newSeries.setData(this._rawCandles.map(c => ({ time: c.time, high: c.high, low: c.low, levels: c.levels })));
                break;

            default:
                return this._currentSeries;
        }

        this._currentSeries = newSeries;
        this._currentType = type;
        return newSeries;
    }

    getCurrentSeries() {
        return this._currentSeries;
    }

    getCurrentType() {
        return this._currentType;
    }

    updatePrice(candle) {
        if (!this._currentSeries) return;
        const type = this._currentType;
        if (type === 'candle' || type === 'bar' || type === 'renko' || type === 'pf') {
            this._currentSeries.update(candle);
        } else if (type === 'cluster' || type === 'box') {
            this._currentSeries.update({ time: candle.time, high: candle.high, low: candle.low, levels: candle.levels });
        } else if (type === 'heikin') {
            // Approximate HA update using last raw candle
            const haClose = (candle.open + candle.high + candle.low + candle.close) / 4;
            const prev = this._lastHA || { open: candle.open, close: candle.close };
            const haOpen = (prev.open + prev.close) / 2;
            const haHigh = Math.max(candle.high, haOpen, haClose);
            const haLow = Math.min(candle.low, haOpen, haClose);
            this._lastHA = { open: haOpen, close: haClose };
            this._currentSeries.update({ time: candle.time, open: haOpen, high: haHigh, low: haLow, close: haClose });
        } else {
            this._currentSeries.update({ time: candle.time, value: candle.close });
        }
    }

    _computeHeikinAshi(candles) {
        if (!candles || candles.length === 0) return [];
        const result: any[] = [];
        let prevOpen = candles[0].open;
        let prevClose = candles[0].close;

        for (const c of candles) {
            const haClose = (c.open + c.high + c.low + c.close) / 4;
            const haOpen = (prevOpen + prevClose) / 2;
            const haHigh = Math.max(c.high, haOpen, haClose);
            const haLow = Math.min(c.low, haOpen, haClose);
            result.push({ time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose });
            prevOpen = haOpen;
            prevClose = haClose;
        }

        this._lastHA = { open: prevOpen, close: prevClose };
        return result;
    }
}
