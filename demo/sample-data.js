// Deterministic market data for the sschart demo. A seeded PRNG keeps the
// picture stable run-to-run; nothing here touches the network. The generator
// mirrors the shapes the engine consumes: OHLC candles (with per-candle volume
// and volume-by-price `levels` for the footprint / cluster / box studies),
// plus derived studies (Bollinger, MACD, equity) and a realtime tick source.
(function (global) {
    'use strict';

    function mulberry32(seed) {
        return function () {
            seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    var rnd = mulberry32(20240519);
    var r2 = function (v) { return Math.round(v * 100) / 100; };

    var DAY = 86400;
    var START = Math.floor(Date.UTC(2024, 0, 2) / 1000);

    // Volume-by-price levels for one bar (footprint / cluster / box studies):
    // a bell of volume centred on a random peak inside the bar's [low,high].
    function genLevels(low, high, vol) {
        var nL = Math.max(3, Math.min(12, Math.round((high - low) / 0.4)));
        var lstep = (high - low) / nL, peak = low + (0.25 + rnd() * 0.5) * (high - low), levels = [];
        for (var li = 0; li < nL; li++) {
            var pr = low + (li + 0.5) * lstep;
            var w = 1 / (1 + Math.abs(pr - peak) * 1.4);
            levels.push({ price: r2(pr), vol: Math.round(vol * w / nL + rnd() * 40) });
        }
        return levels;
    }

    // Build one OHLC bar advancing from a previous close.
    function makeBar(prevClose, time) {
        var open = prevClose + (rnd() - 0.48) * 2;
        var close = open + (rnd() - 0.5) * 3.2;
        var high = Math.max(open, close) + rnd() * 1.6;
        var low = Math.max(1, Math.min(open, close) - rnd() * 1.6);
        var vol = Math.round(800 + (high - low) * 600 + Math.abs(close - open) * 900 + rnd() * 1200);
        return {
            time: time, open: r2(open), high: r2(high), low: r2(low), close: r2(close),
            vol: vol, levels: genLevels(low, high, vol)
        };
    }

    function genCandles(count, startPrice) {
        var data = [], price = startPrice, time = START;
        for (var i = 0; i < count; i++) {
            var bar = makeBar(price, time);
            data.push(bar);
            price = bar.close; time += DAY;
        }
        return data;
    }

    function sma(vals, p) {
        var out = new Array(vals.length).fill(null), sum = 0;
        for (var i = 0; i < vals.length; i++) {
            sum += vals[i];
            if (i >= p) sum -= vals[i - p];
            if (i >= p - 1) out[i] = sum / p;
        }
        return out;
    }
    function bollinger(c, p, k) {
        var cl = c.map(function (x) { return x.close; }), m = sma(cl, p);
        var up = [], mid = [], lo = [];
        for (var i = p - 1; i < c.length; i++) {
            var mean = m[i]; if (mean === null) continue;
            var v = 0;
            for (var j = i - p + 1; j <= i; j++) { var d = cl[j] - mean; v += d * d; }
            var sd = Math.sqrt(v / p), t = c[i].time;
            up.push({ time: t, value: r2(mean + k * sd) });
            mid.push({ time: t, value: r2(mean) });
            lo.push({ time: t, value: r2(mean - k * sd) });
        }
        return { upper: up, middle: mid, lower: lo };
    }
    function ema(vals, p) {
        var out = new Array(vals.length).fill(null), kf = 2 / (p + 1);
        var cnt = 0, sum = 0, prev = null;
        for (var i = 0; i < vals.length; i++) {
            var x = vals[i];
            if (x === null) { out[i] = null; continue; }
            cnt++; sum += x;
            if (cnt < p) { out[i] = null; continue; }
            if (cnt === p) { prev = sum / p; out[i] = prev; continue; }
            prev = x * kf + prev * (1 - kf); out[i] = prev;
        }
        return out;
    }
    function macd(c) {
        var cl = c.map(function (x) { return x.close; });
        var f = ema(cl, 12), s = ema(cl, 26);
        var line = cl.map(function (_, i) { return (f[i] !== null && s[i] !== null) ? f[i] - s[i] : null; });
        var sig = ema(line, 9), hist = [], mline = [], msig = [];
        for (var i = 0; i < c.length; i++) {
            if (line[i] === null || sig[i] === null) continue;
            var val = r2(line[i] - sig[i]);
            hist.push({ time: c[i].time, value: val, color: val >= 0 ? '#0ecb81' : '#f6465d' });
            mline.push({ time: c[i].time, value: r2(line[i]) });
            msig.push({ time: c[i].time, value: r2(sig[i]) });
        }
        return { hist: hist, line: mline, signal: msig };
    }
    // Wilder's RSI(p) -> [{time,value}] in 0..100.
    function rsi(c, p) {
        var out = [], gain = 0, loss = 0;
        for (var i = 1; i < c.length; i++) {
            var d = c[i].close - c[i - 1].close;
            var g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
            if (i <= p) {
                gain += g; loss += l;
                if (i === p) {
                    gain /= p; loss /= p;
                    var rs0 = loss === 0 ? 100 : gain / loss;
                    out.push({ time: c[i].time, value: r2(100 - 100 / (1 + rs0)) });
                }
                continue;
            }
            gain = (gain * (p - 1) + g) / p;
            loss = (loss * (p - 1) + l) / p;
            var rs = loss === 0 ? 100 : gain / loss;
            out.push({ time: c[i].time, value: r2(100 - 100 / (1 + rs)) });
        }
        return out;
    }
    // EMA(p) over closes -> [{time,value}] (nulls before warm-up dropped).
    function emaLine(c, p) {
        var e = ema(c.map(function (x) { return x.close; }), p), out = [];
        for (var i = 0; i < c.length; i++) if (e[i] !== null) out.push({ time: c[i].time, value: r2(e[i]) });
        return out;
    }
    // ---- indicator calculations (parameterized; each -> [{time,value}] or a
    //      multi-key object; nulls before warm-up are dropped) ----
    function closesOf(c) { return c.map(function (x) { return x.close; }); }
    function toLine(c, arr) {
        var o = [];
        for (var i = 0; i < c.length; i++) if (arr[i] !== null && arr[i] !== undefined && isFinite(arr[i])) o.push({ time: c[i].time, value: r2(arr[i]) });
        return o;
    }
    function smaLine(c, p) { return toLine(c, sma(closesOf(c), p)); }
    function macdCalc(c, fast, slow, sig) {
        var cl = closesOf(c), f = ema(cl, fast), s = ema(cl, slow);
        var line = cl.map(function (_, i) { return (f[i] !== null && s[i] !== null) ? f[i] - s[i] : null; });
        var sg = ema(line, sig), hist = [], ml = [], ms = [];
        for (var i = 0; i < c.length; i++) {
            if (line[i] === null || sg[i] === null) continue;
            var v = r2(line[i] - sg[i]);
            hist.push({ time: c[i].time, value: v, color: v >= 0 ? '#0ecb81' : '#f6465d' });
            ml.push({ time: c[i].time, value: r2(line[i]) }); ms.push({ time: c[i].time, value: r2(sg[i]) });
        }
        return { hist: hist, line: ml, signal: ms };
    }
    function momentum(c, p) {
        var cl = closesOf(c), o = new Array(cl.length).fill(null);
        for (var i = p; i < cl.length; i++) o[i] = cl[i] - cl[i - p];
        return toLine(c, o);
    }
    function stochastic(c, kp, dp) {
        var kArr = new Array(c.length).fill(null);
        for (var i = kp - 1; i < c.length; i++) {
            var lo = Infinity, hi = -Infinity;
            for (var j = i - kp + 1; j <= i; j++) { if (c[j].low < lo) lo = c[j].low; if (c[j].high > hi) hi = c[j].high; }
            kArr[i] = hi > lo ? 100 * (c[i].close - lo) / (hi - lo) : 50;
        }
        var dArr = new Array(c.length).fill(null);
        for (var i = kp - 1 + dp - 1; i < c.length; i++) { var s = 0; for (var j = i - dp + 1; j <= i; j++) s += kArr[j]; dArr[i] = s / dp; }
        return { k: toLine(c, kArr), d: toLine(c, dArr) };
    }
    function atr(c, p) {
        var tr = new Array(c.length).fill(null), out = new Array(c.length).fill(null), sum = 0;
        for (var i = 0; i < c.length; i++) {
            if (i === 0) { tr[i] = c[i].high - c[i].low; }
            else { var pc = c[i - 1].close; tr[i] = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - pc), Math.abs(c[i].low - pc)); }
            if (i < p) { sum += tr[i]; if (i === p - 1) out[i] = sum / p; }
            else out[i] = (out[i - 1] * (p - 1) + tr[i]) / p;
        }
        return toLine(c, out);
    }
    function trades(c) {
        var out = [], buy = true;
        for (var i = 18; i < c.length; i += 22) {
            out.push({ time: c[i].time, side: buy ? 'Buy' : 'Sell', price: r2(c[i].close) });
            buy = !buy;
        }
        return out;
    }
    function markers(tr) {
        return tr.map(function (t) {
            return {
                time: t.time,
                position: t.side === 'Buy' ? 'belowBar' : 'aboveBar',
                color: t.side === 'Buy' ? '#31c15b' : '#ff6d6d',
                shape: t.side === 'Buy' ? 'arrowUp' : 'arrowDown',
                text: t.side === 'Buy' ? 'BUY' : 'SELL'
            };
        });
    }
    function equity(c, tr) {
        var out = [], base = 100000, realized = 0, entry = null, ti = 0;
        for (var k = 0; k < c.length; k++) {
            var candle = c[k];
            while (ti < tr.length && tr[ti].time === candle.time) {
                var t = tr[ti];
                if (t.side === 'Buy') entry = t.price;
                else if (entry !== null) { realized += r2(t.price - entry); entry = null; }
                ti++;
            }
            var val = base + realized;
            if (entry !== null) val += candle.close - entry;
            out.push({ time: candle.time, value: r2(val) });
        }
        return out;
    }
    // volume profile: split the whole price range into bins and spread each
    // candle's volume across the bins its [low,high] covers.
    function volProfile(c, bins) {
        var lo = Infinity, hi = -Infinity;
        for (var i = 0; i < c.length; i++) { lo = Math.min(lo, c[i].low); hi = Math.max(hi, c[i].high); }
        var step = (hi - lo) / bins, agg = new Array(bins).fill(0);
        for (var k = 0; k < c.length; k++) {
            var b0 = Math.max(0, Math.floor((c[k].low - lo) / step));
            var b1 = Math.min(bins - 1, Math.floor((c[k].high - lo) / step));
            var per = c[k].vol / (b1 - b0 + 1);
            for (var bi = b0; bi <= b1; bi++) agg[bi] += per;
        }
        return agg.map(function (v, i) { return { price: r2(lo + (i + 0.5) * step), value: Math.round(v) }; });
    }

    var candles = genCandles(180, 120);
    var tr = trades(candles);
    var bb = bollinger(candles, 20, 2);
    var mac = macd(candles);

    // Indicator registry for the demo's picker: metadata (id / name / fullName /
    // group / pane / params) + a calc(candles, params) that returns
    // { lines:[{data,color,width}], hist?, guides? } normalised for rendering.
    // 'overlay' draws on the price chart; 'sub' gets its own pane.
    var indicatorRegistry = [
        { id: 'sma', name: 'SMA', fullName: 'Simple Moving Average', group: 'Trend', pane: 'overlay',
          params: [{ key: 'period', label: 'Period', def: 20, min: 2, max: 400 }],
          calc: function (c, p) { return { lines: [{ data: smaLine(c, p.period), color: '#f0b90b', width: 2 }] }; } },
        { id: 'ema', name: 'EMA', fullName: 'Exponential Moving Average', group: 'Trend', pane: 'overlay',
          params: [{ key: 'period', label: 'Period', def: 21, min: 2, max: 400 }],
          calc: function (c, p) { return { lines: [{ data: emaLine(c, p.period), color: '#22d3ee', width: 2 }] }; } },
        { id: 'bb', name: 'BB', fullName: 'Bollinger Bands', group: 'Volatility', pane: 'overlay',
          params: [{ key: 'period', label: 'Period', def: 20, min: 2, max: 400 }, { key: 'mult', label: 'StdDev', def: 2, min: 1, max: 5, step: 0.1 }],
          calc: function (c, p) { var b = bollinger(c, p.period, p.mult); return { lines: [
              { data: b.upper, color: '#4a9eff', width: 1 }, { data: b.middle, color: '#f0b90b', width: 1 }, { data: b.lower, color: '#4a9eff', width: 1 }] }; } },
        { id: 'macd', name: 'MACD', fullName: 'Moving Average Convergence/Divergence', group: 'Momentum', pane: 'sub',
          params: [{ key: 'fast', label: 'Fast', def: 12, min: 2, max: 100 }, { key: 'slow', label: 'Slow', def: 26, min: 2, max: 200 }, { key: 'signal', label: 'Signal', def: 9, min: 2, max: 100 }],
          calc: function (c, p) { var m = macdCalc(c, p.fast, p.slow, p.signal); return { hist: m.hist, lines: [
              { data: m.line, color: '#4a9eff', width: 1.5 }, { data: m.signal, color: '#f0b90b', width: 1.5 }] }; } },
        { id: 'rsi', name: 'RSI', fullName: 'Relative Strength Index', group: 'Momentum', pane: 'sub',
          params: [{ key: 'period', label: 'Period', def: 14, min: 2, max: 100 }],
          guides: [{ v: 70, c: 'down' }, { v: 30, c: 'up' }, { v: 50, c: 'grid' }],
          calc: function (c, p) { return { lines: [{ data: rsi(c, p.period), color: '#a855f7', width: 2 }] }; } },
        { id: 'stoch', name: 'Stoch', fullName: 'Stochastic Oscillator', group: 'Momentum', pane: 'sub',
          params: [{ key: 'k', label: '%K', def: 14, min: 2, max: 100 }, { key: 'd', label: '%D', def: 3, min: 1, max: 50 }],
          guides: [{ v: 80, c: 'down' }, { v: 20, c: 'up' }],
          calc: function (c, p) { var s = stochastic(c, p.k, p.d); return { lines: [{ data: s.k, color: '#4a9eff', width: 1.5 }, { data: s.d, color: '#f0b90b', width: 1.5 }] }; } },
        { id: 'mom', name: 'Momentum', fullName: 'Momentum', group: 'Momentum', pane: 'sub',
          params: [{ key: 'period', label: 'Period', def: 10, min: 1, max: 100 }],
          guides: [{ v: 0, c: 'grid' }],
          calc: function (c, p) { return { lines: [{ data: momentum(c, p.period), color: '#22d3ee', width: 2 }] }; } },
        { id: 'atr', name: 'ATR', fullName: 'Average True Range', group: 'Volatility', pane: 'sub',
          params: [{ key: 'period', label: 'Period', def: 14, min: 2, max: 100 }],
          calc: function (c, p) { return { lines: [{ data: atr(c, p.period), color: '#fb923c', width: 2 }] }; } }
    ];

    global.SampleData = {
        candles: candles,
        indicators: indicatorRegistry,
        bollinger: bb,
        sma20: bb.middle,                 // Bollinger middle == SMA(20)
        macd: mac.hist,
        macdLine: mac.line,
        macdSignal: mac.signal,
        rsi: rsi(candles, 14),
        ema8: emaLine(candles, 8),
        ema21: emaLine(candles, 21),
        ema55: emaLine(candles, 55),
        markers: markers(tr),
        equity: equity(candles, tr),
        line: candles.map(function (c) { return { time: c.time, value: c.close }; }),
        area: candles.map(function (c) { return { time: c.time, value: c.close }; }),
        volume: candles.map(function (c) {
            return { time: c.time, value: c.vol, color: c.close >= c.open ? 'rgba(14,203,129,0.5)' : 'rgba(246,70,93,0.5)' };
        }),
        volumeProfile: volProfile(candles, 48),

        // Volume-by-price levels for a live bar, so the footprint / cluster /
        // box panes can seal a new bar during the realtime feed.
        levelsFor: function (bar) { return genLevels(bar.low, bar.high, bar.vol); },

        // --- realtime tick source -------------------------------------------
        // Returns a stateful feed that either refines the current forming bar or
        // rolls a brand-new bar, so the demo can drive series.update(...) live.
        makeFeed: function () {
            var last = candles[candles.length - 1];
            var price = last.close;
            var time = last.time + DAY;
            var open = price, high = price, low = price, vol = 0;
            return {
                // advance one tick; every `ticksPerBar` ticks a bar is sealed.
                next: function (ticksPerBar) {
                    price = Math.max(1, price + (rnd() - 0.5) * 1.4);
                    high = Math.max(high, price);
                    low = Math.min(low, price);
                    vol += Math.round(40 + rnd() * 120);
                    var bar = { time: time, open: r2(open), high: r2(high), low: r2(low), close: r2(price), vol: vol };
                    bar.sealed = false;
                    if ((this._n = (this._n || 0) + 1) >= ticksPerBar) {
                        bar.sealed = true; this._n = 0;
                        time += DAY; open = high = low = price; vol = 0;
                    }
                    return bar;
                }
            };
        }
    };
})(window);
