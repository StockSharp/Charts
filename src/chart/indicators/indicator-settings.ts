// Indicator Settings — config for each indicator (params, pane type, colors, group)
export const IndicatorSettings = (function () {

    // Dark palette from desktop IndicatorColorProvider
    const DARK_PALETTE = [
        '#FFD700', // Gold
        '#00FFFF', // Cyan
        '#00FF00', // Lime
        '#FF00FF', // Fuchsia
        '#FFFF00', // Yellow
        '#FF6347', // Tomato
        '#1E90FF', // DodgerBlue
        '#FFA500', // Orange
        '#FF1493', // DeepPink
        '#FFFFFF', // White
        '#32CD32', // LimeGreen
        '#FFC0CB', // Pink
        '#87CEEB', // SkyBlue
        '#FF0000', // Red
        '#EE82EE', // Violet
    ];

    let _colorIndex = 0;

    function getNextColor() {
        const color = DARK_PALETTE[_colorIndex % DARK_PALETTE.length];
        _colorIndex++;
        return color;
    }

    function resetColorIndex() {
        _colorIndex = 0;
    }

    // Indicator definitions
    const INDICATORS = {
        SMA: {
            name: 'SMA',
            fullName: 'Simple Moving Average',
            group: 'Trend',
            pane: 'overlay',
            params: [{ key: 'period', label: 'Period', type: 'number', default: 20, min: 2, max: 500 }],
            outputs: ['line'],
        },
        EMA: {
            name: 'EMA',
            fullName: 'Exponential Moving Average',
            group: 'Trend',
            pane: 'overlay',
            params: [{ key: 'period', label: 'Period', type: 'number', default: 20, min: 2, max: 500 }],
            outputs: ['line'],
        },
        BollingerBands: {
            name: 'Bollinger Bands',
            fullName: 'Bollinger Bands',
            group: 'Volatility',
            pane: 'overlay',
            params: [
                { key: 'period', label: 'Period', type: 'number', default: 20, min: 2, max: 500 },
                { key: 'stdDev', label: 'Std Dev', type: 'number', default: 2, min: 0.1, max: 5, step: 0.1 },
            ],
            outputs: ['band'],
        },
        Envelope: {
            name: 'Envelope',
            fullName: 'Moving Average Envelope',
            group: 'Volatility',
            pane: 'overlay',
            params: [
                { key: 'period', label: 'Period', type: 'number', default: 20, min: 2, max: 500 },
                { key: 'percent', label: 'Percent', type: 'number', default: 2.5, min: 0.1, max: 20, step: 0.1 },
            ],
            outputs: ['band'],
        },
        MACD: {
            name: 'MACD',
            fullName: 'Moving Average Convergence/Divergence',
            group: 'Momentum',
            pane: 'separate',
            params: [
                { key: 'fast', label: 'Fast', type: 'number', default: 12, min: 2, max: 100 },
                { key: 'slow', label: 'Slow', type: 'number', default: 26, min: 2, max: 200 },
                { key: 'signal', label: 'Signal', type: 'number', default: 9, min: 2, max: 50 },
            ],
            outputs: ['macd-hist'],
        },
        RSI: {
            name: 'RSI',
            fullName: 'Relative Strength Index',
            group: 'Momentum',
            pane: 'separate',
            params: [{ key: 'period', label: 'Period', type: 'number', default: 14, min: 2, max: 100 }],
            outputs: ['oscillator'],
            scaleRange: { min: 0, max: 100 },
            levels: [30, 70],
        },
        Stochastic: {
            name: 'Stochastic',
            fullName: 'Stochastic Oscillator',
            group: 'Momentum',
            pane: 'separate',
            params: [
                { key: 'kPeriod', label: '%K Period', type: 'number', default: 14, min: 2, max: 100 },
                { key: 'dPeriod', label: '%D Period', type: 'number', default: 3, min: 1, max: 50 },
                { key: 'smooth', label: 'Smooth', type: 'number', default: 3, min: 1, max: 50 },
            ],
            outputs: ['dual-line'],
            scaleRange: { min: 0, max: 100 },
            levels: [20, 80],
        },
        ADX: {
            name: 'ADX',
            fullName: 'Average Directional Index',
            group: 'Trend',
            pane: 'separate',
            params: [{ key: 'period', label: 'Period', type: 'number', default: 14, min: 2, max: 100 }],
            outputs: ['triple-line'],
        },
        Alligator: {
            name: 'Alligator',
            fullName: 'Williams Alligator',
            group: 'Trend',
            pane: 'overlay',
            params: [
                { key: 'jaw', label: 'Jaw', type: 'number', default: 13, min: 2, max: 100 },
                { key: 'teeth', label: 'Teeth', type: 'number', default: 8, min: 2, max: 100 },
                { key: 'lips', label: 'Lips', type: 'number', default: 5, min: 2, max: 100 },
            ],
            outputs: ['triple-line'],
        },
        Ichimoku: {
            name: 'Ichimoku',
            fullName: 'Ichimoku Cloud',
            group: 'Trend',
            pane: 'overlay',
            params: [
                { key: 'tenkan', label: 'Tenkan', type: 'number', default: 9, min: 2, max: 100 },
                { key: 'kijun', label: 'Kijun', type: 'number', default: 26, min: 2, max: 100 },
                { key: 'senkouB', label: 'Senkou B', type: 'number', default: 52, min: 2, max: 200 },
            ],
            outputs: ['ichimoku'],
        },
        ParabolicSAR: {
            name: 'Parabolic SAR',
            fullName: 'Parabolic Stop and Reverse',
            group: 'Trend',
            pane: 'overlay',
            params: [
                { key: 'step', label: 'Step', type: 'number', default: 0.02, min: 0.001, max: 0.5, step: 0.001 },
                { key: 'max', label: 'Max', type: 'number', default: 0.2, min: 0.01, max: 1, step: 0.01 },
            ],
            outputs: ['dots'],
        },
        ZigZag: {
            name: 'ZigZag',
            fullName: 'ZigZag',
            group: 'Volatility',
            pane: 'overlay',
            params: [{ key: 'deviation', label: 'Deviation %', type: 'number', default: 5, min: 0.1, max: 50, step: 0.1 }],
            outputs: ['zigzag'],
        },
        Fractals: {
            name: 'Fractals',
            fullName: 'Williams Fractals',
            group: 'Volatility',
            pane: 'overlay',
            params: [{ key: 'period', label: 'Period', type: 'number', default: 2, min: 1, max: 10 }],
            outputs: ['fractals'],
        },
        RVI: {
            name: 'RVI',
            fullName: 'Relative Vigor Index',
            group: 'Momentum',
            pane: 'separate',
            params: [{ key: 'period', label: 'Period', type: 'number', default: 10, min: 2, max: 100 }],
            outputs: ['dual-line'],
        },
        PPO: {
            name: 'PPO',
            fullName: 'Percentage Price Oscillator',
            group: 'Momentum',
            pane: 'separate',
            params: [
                { key: 'fast', label: 'Fast', type: 'number', default: 12, min: 2, max: 100 },
                { key: 'slow', label: 'Slow', type: 'number', default: 26, min: 2, max: 200 },
                { key: 'signal', label: 'Signal', type: 'number', default: 9, min: 2, max: 50 },
            ],
            outputs: ['macd-hist'],
        },
        GatorOscillator: {
            name: 'Gator Oscillator',
            fullName: 'Gator Oscillator',
            group: 'Momentum',
            pane: 'separate',
            params: [
                { key: 'jaw', label: 'Jaw', type: 'number', default: 13, min: 2, max: 100 },
                { key: 'teeth', label: 'Teeth', type: 'number', default: 8, min: 2, max: 100 },
                { key: 'lips', label: 'Lips', type: 'number', default: 5, min: 2, max: 100 },
            ],
            outputs: ['dual-hist'],
        },
        Volume: {
            name: 'Volume',
            fullName: 'Volume',
            group: 'Volume',
            pane: 'separate',
            params: [],
            outputs: ['histogram'],
        },
    };

    // Groups for dialog
    const GROUPS = ['Trend', 'Momentum', 'Volatility', 'Volume'];

    function getIndicator(id) {
        return INDICATORS[id] || null;
    }

    function getAllIndicators() {
        return Object.keys(INDICATORS).map(k => ({ id: k, ...INDICATORS[k] }));
    }

    function getByGroup(group) {
        return Object.keys(INDICATORS)
            .filter(k => INDICATORS[k].group === group)
            .map(k => ({ id: k, ...INDICATORS[k] }));
    }

    // Fetches the full indicator catalog from /api/v1/indicators/catalog and
    // merges server-provided entries (localized name / description / params /
    // output names) into the local INDICATORS dict. Existing client-only
    // metadata (group, pane overrides, levels) on known kinds is kept; new
    // kinds the server discovers land with sane defaults so the picker dialog
    // shows the whole StockSharp indicator family, not just the 17 we
    // hand-wired originally.
    async function loadCatalog(baseUrl) {
        const prefix = (baseUrl || '').replace(/\/$/, '');
        try {
            const resp = await fetch(prefix + '/api/v1/indicators/catalog', { credentials: 'same-origin' });
            if (!resp.ok) return;
            const entries = await resp.json();
            if (!Array.isArray(entries)) return;

            // Client id (for back-compat with existing INDICATORS keys and
            // indicator-renderer switches): prefer short alias when the server
            // hands us one (sma/ema/bb/...), otherwise use the StockSharp type
            // name as-is.
            for (const entry of entries) {
                const id = (entry.alias && entry.alias !== entry.kind) ? aliasToClientId(entry.alias) : entry.kind;
                const existing = INDICATORS[id] || {};
                // Server-authoritative measure maps straight to
                // IIndicator.Measure on the StockSharp side — this is how the
                // engine decides where to draw: Price → overlay on candles,
                // Percent/MinusOnePlusOne/Volume → separate pane, grouped
                // with other indicators of the same measure.
                const measure = entry.measure || (entry.pane === 'separate' ? 'Percent' : 'Price');
                const derivedPane = measure === 'Price' ? 'overlay' : 'separate';
                // Server 'name' is the StockSharp-localized short display
                // ("SMA", "SMMA", "%R"). 'description' is the long form
                // ("Simple Moving Average"). Prefer server over hardcoded
                // client text so non-English locales get translated labels.
                INDICATORS[id] = {
                    name: entry.name || existing.name || (entry.alias || entry.kind),
                    fullName: entry.description || existing.fullName || entry.name,
                    group: existing.group || inferGroup(entry.pane),
                    pane: existing.pane || derivedPane,
                    measure,
                    params: existing.params || paramsFromCatalog(entry.parameters),
                    // Server-authoritative: SubscribeIndicator wants the alias
                    // when one exists ("adx", "sma") so the typed plan in
                    // IndicatorComputationService.BuildPlan matches; the raw
                    // type name ("AverageDirectionalIndex") falls through to
                    // the reflection-based generic path, which exposes inner
                    // indicators (DMI, Wilder MA) but can't always extract
                    // them — leaving series silently empty.
                    serverKind: entry.alias || entry.kind,
                    outputs: entry.outputNames,
                };
            }
        } catch (err) {
            console.warn('[Indicators] failed to load catalog:', err);
        }
    }

    function aliasToClientId(alias) {
        // Legacy aliases were uppercase ("SMA"); the catalog returns them as
        // lowercase short codes ("sma"). Map to the existing uppercase keys
        // that indicator-renderer.js still switches on.
        const map = {
            sma: 'SMA', ema: 'EMA', rsi: 'RSI', atr: 'ATR', adx: 'ADX',
            macd: 'MACD', bb: 'BollingerBands', stochastic: 'Stochastic',
            envelope: 'Envelope', alligator: 'Alligator', ichimoku: 'Ichimoku',
            psar: 'ParabolicSAR', rvi: 'RVI', ppo: 'PPO', gator: 'GatorOscillator',
            volume: 'Volume', zigzag: 'ZigZag', fractals: 'Fractals',
        };
        return map[alias.toLowerCase()] || alias;
    }

    function inferGroup(pane) {
        return pane === 'separate' ? 'Momentum' : 'Trend';
    }

    function paramsFromCatalog(parameters) {
        if (!parameters) return [];
        return parameters.map(p => {
            const isInt = p.type === 'int';
            return {
                key: p.key,
                label: p.label || p.key,
                type: p.type,
                default: p.default,
                // Dialog renders <input type=number> and reads step/min/max.
                // Undefined attributes render literally in some browsers, so
                // fill plausible defaults based on the declared type.
                step: isInt ? 1 : 0.0001,
                min: isInt ? 1 : undefined,
                max: undefined,
            };
        });
    }

    return {
        DARK_PALETTE,
        GROUPS,
        getIndicator,
        getAllIndicators,
        getByGroup,
        getNextColor,
        resetColorIndex,
        loadCatalog,
    };
})();
