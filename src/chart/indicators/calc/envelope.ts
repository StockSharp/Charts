// Envelope — SMA of close with constant percentage upper/lower bands.
//   middle[i] = SMA(close, length)
//   upper[i]  = middle[i] * (1 + percent/100)
//   lower[i]  = middle[i] * (1 - percent/100)
// Same shape as BollingerBands so the renderer's
// `case 'BollingerBands' | 'Envelope'` branch can consume
// `data.upper / middle / lower` uniformly. `percent` defaults to 1.0
// (meaning ±1%).

import { simpleMA } from './helpers.js';
import type { CandlePoint, IndicatorParams, IndicatorPoint } from './types.js';

interface EnvelopeSeries {
    upper: IndicatorPoint[];
    middle: IndicatorPoint[];
    lower: IndicatorPoint[];
}

export function calcEnvelope(candles: CandlePoint[], params?: IndicatorParams): EnvelopeSeries {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;
    const percent = params && Number.isFinite(params.percent) ? +params.percent : 1.0;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { upper: [], middle: [], lower: [] };
    }

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const mid = simpleMA(closes, length);
    const upper = new Array(n);
    const middle = new Array(n);
    const lower = new Array(n);
    const k = percent / 100;

    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        const m = mid[i];
        if (m === null) {
            upper[i] = { time: t, value: null };
            middle[i] = { time: t, value: null };
            lower[i] = { time: t, value: null };
            continue;
        }
        middle[i] = { time: t, value: m };
        upper[i] = { time: t, value: m * (1 + k) };
        lower[i] = { time: t, value: m * (1 - k) };
    }

    return { upper, middle, lower };
}
