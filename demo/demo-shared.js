// Shared helpers for the multi-page sschart showcase. Everything here is plain
// browser JS over the `SSChart` global (dist/sschart.js) and touches no network:
// a seeded PRNG keeps every page deterministic run-to-run. Exposed as `Demo`.
(function (global) {
    'use strict';

    // ---- deterministic PRNG (mulberry32) -----------------------------------
    function prng(seed) {
        return function () {
            seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ---- palettes + chart theme --------------------------------------------
    var PALETTES = {
        dark: {
            name: 'dark',
            surf: '#131820', panel: '#131820', bg: '#0b0e11',
            text: '#c7d0dc', textDim: '#6b7a8d', textBright: '#ffffff',
            grid: 'rgba(48,61,80,0.45)', border: '#2a3546', header: '#131820',
            up: '#26a69a', down: '#ef5350', accent: '#4a9eff',
            bid: '#26a69a', ask: '#ef5350', buy: '#26a69a', sell: '#ef5350',
        },
        light: {
            name: 'light',
            surf: '#ffffff', panel: '#f4f6fa', bg: '#eef1f6',
            text: '#2a3441', textDim: '#67748a', textBright: '#0b1220',
            grid: 'rgba(120,140,160,0.22)', border: '#cbd5e1', header: '#ffffff',
            up: '#0f9d80', down: '#e03d4e', accent: '#2f6fed',
            bid: '#0f9d80', ask: '#e03d4e', buy: '#0f9d80', sell: '#e03d4e',
        },
    };

    // Build a createChart() options object from a palette. `extra` shallow-merges
    // over the timeScale block so pages can flip ordinal/continuous per data set.
    function chartTheme(pal, timeScaleExtra) {
        var ts = {
            borderColor: pal.border, timeVisible: true, rightOffset: 6,
        };
        if (timeScaleExtra) for (var k in timeScaleExtra) ts[k] = timeScaleExtra[k];
        return {
            autoSize: true,
            layout: {
                background: { type: 'solid', color: pal.surf },
                textColor: pal.text,
                fontFamily: "'IBM Plex Mono','Consolas',monospace",
                fontSize: 11,
                attributionLogo: false,
            },
            grid: { vertLines: { color: pal.grid }, horzLines: { color: pal.grid } },
            rightPriceScale: { borderColor: pal.border },
            timeScale: ts,
        };
    }

    // Push palette values into CSS custom properties so the page chrome (headers,
    // buttons, side panels) tracks the same dark/light choice as the chart.
    function applyCssPalette(pal) {
        var r = document.documentElement.style;
        r.setProperty('--t-bg', pal.bg);
        r.setProperty('--t-panel', pal.panel);
        r.setProperty('--t-header', pal.header);
        r.setProperty('--t-text', pal.text);
        r.setProperty('--t-text-dim', pal.textDim);
        r.setProperty('--t-text-bright', pal.textBright);
        r.setProperty('--t-border', pal.border);
        r.setProperty('--t-accent', pal.accent);
        r.setProperty('--t-up', pal.up);
        r.setProperty('--t-down', pal.down);
    }

    var r2 = function (v) { return Math.round(v * 100) / 100; };
    var toTick = function (v, tick) { return Math.round(v / tick) * tick; };

    // ---- OHLCV candles ------------------------------------------------------
    // A gently trending random walk. `startTime` is Unix seconds, `step` seconds
    // per bar. Returns { time, open, high, low, close, volume }.
    function genCandles(count, opts) {
        opts = opts || {};
        var rnd = prng(opts.seed || 20260724);
        var step = opts.step || 60;
        var time = opts.startTime || Math.floor(Date.UTC(2026, 0, 2) / 1000);
        var price = opts.startPrice || 100;
        var drift = opts.drift || 0;
        var out = [];
        for (var i = 0; i < count; i++) {
            var open = price + (rnd() - 0.5) * 0.6;
            var close = open + (rnd() - 0.5) * 1.6 + drift;
            var high = Math.max(open, close) + rnd() * 0.9;
            var low = Math.max(1, Math.min(open, close) - rnd() * 0.9);
            var vol = Math.round(600 + (high - low) * 700 + Math.abs(close - open) * 800 + rnd() * 900);
            out.push({ time: time, open: r2(open), high: r2(high), low: r2(low), close: r2(close), volume: vol });
            price = close; time += step;
        }
        return out;
    }

    // ---- exact order-flow bars ---------------------------------------------
    // Exact footprint bars: OHLC plus tick-aligned bid/ask volume levels, the
    // shape FootprintSeries / ExactVolumeProfileSeries consume. `dataMode: Exact`
    // is required by the exact order-flow contract.
    function genExactBars(count, opts) {
        opts = opts || {};
        var tick = opts.tickSize || 0.25;
        var rnd = prng(opts.seed || 424242);
        var step = opts.step || 60;
        var time = opts.startTime || Math.floor(Date.UTC(2026, 6, 1) / 1000);
        var out = [];
        for (var i = 0; i < count; i++) {
            var center = 100 + Math.round(Math.sin(i / 11) * 16 + (rnd() - 0.5) * 3) * tick;
            var close = center + ((i % 3) - 1) * tick;
            var low = Math.min(center, close) - tick * (3 + Math.round(rnd() * 3));
            var high = Math.max(center, close) + tick * (3 + Math.round(rnd() * 3));
            var levels = [];
            for (var price = low, level = 0; price <= high + 1e-9; price += tick, level++) {
                // Bell of interest around the bar centre, biased per bar so the
                // profile point-of-control drifts with price.
                var dist = Math.abs(price - center);
                var w = 1 / (1 + dist * 1.1);
                levels.push({
                    price: toTick(price, tick),
                    bidVolume: Math.round((4 + ((i * 17 + level * 11) % 40)) * w),
                    askVolume: Math.round((5 + ((i * 13 + level * 19) % 44)) * w),
                    tradeCount: 1 + ((i + level) % 9),
                });
            }
            out.push({
                dataMode: SSChart.OrderFlowDataMode.Exact,
                time: time, open: center, high: high, low: low, close: close, levels: levels,
            });
            time += step;
        }
        return out;
    }

    // ---- TPO bars -----------------------------------------------------------
    // TPO consumes OHLC plus a session id; the series builds the letter/block
    // distribution itself. Group `sessionSize` bars into one session.
    function genTpoBars(count, opts) {
        opts = opts || {};
        var sessionSize = opts.sessionSize || 24;
        var candles = genCandles(count, opts);
        return candles.map(function (c, i) {
            return {
                time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
                sessionId: 'S' + Math.floor(i / sessionSize),
            };
        });
    }

    // ---- fake async datafeed (IChartDataSource) -----------------------------
    // Serves an in-memory bar array in pages, newest first. The initial call
    // (`to === undefined`) returns the last `initialCount`; each history call
    // returns the `historyCount` bars ending strictly before `to`, with a small
    // latency so the loading state is visible. Optional realtime appends ticks.
    function makeArrayFeed(all, opts) {
        opts = opts || {};
        var latency = opts.latencyMs == null ? 350 : opts.latencyMs;
        return {
            resolveSymbol: function (request) {
                return Promise.resolve({ id: request.symbol, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
            },
            getBars: function (request) {
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        var end;
                        if (request.to === undefined) end = all.length;
                        else {
                            end = all.length;
                            for (var i = 0; i < all.length; i++) {
                                if (all[i].time >= request.to) { end = i; break; }
                            }
                        }
                        var start = Math.max(0, end - request.countBack);
                        resolve({
                            bars: all.slice(start, end),
                            hasMoreBefore: start > 0,
                            hasMoreAfter: false,
                        });
                    }, latency);
                });
            },
            subscribeBars: function () { return function () {}; },
        };
    }

    // ---- fake broker for the trading layer ----------------------------------
    // Consumes intents from an ITradingLayer, echoes an optimistic path, then
    // (after a delay) mutates canonical state and resolves accept/reject. It owns
    // the canonical orders/positions so the chart never talks to a "broker".
    function makeFakeBroker(layer, opts) {
        opts = opts || {};
        var delay = opts.delayMs == null ? 650 : opts.delayMs;
        var onLog = opts.onLog || function () {};
        var state = { rejectNext: false };
        var orders = (opts.orders || []).slice();
        var positions = (opts.positions || []).slice();

        function pushOrders() { layer.setOrders(orders); }
        function pushPositions() { layer.setPositions(positions); }
        function findOrder(id) { for (var i = 0; i < orders.length; i++) if (orders[i].id === id) return i; return -1; }
        function findPos(id) { for (var i = 0; i < positions.length; i++) if (positions[i].id === id) return i; return -1; }
        function bump(o) { return Object.assign({}, o, { revision: (o.revision || 0) + 1 }); }

        layer.subscribeIntents(function (intent) {
            onLog('intent', intent.kind + ' ' + (intent.orderId || intent.positionId || '') + describeIntent(intent));
            setTimeout(function () {
                var reject = state.rejectNext;
                state.rejectNext = false;
                if (reject) {
                    layer.resolveIntent({ intentId: intent.intentId, status: 'rejected', reason: 'broker declined (demo)' });
                    onLog('reject', intent.kind);
                    return;
                }
                applyIntent(intent);
                layer.resolveIntent({ intentId: intent.intentId, status: 'accepted' });
                onLog('accept', intent.kind);
            }, delay);
        });

        function applyIntent(intent) {
            var i;
            switch (intent.kind) {
                case 'modify-order':
                case 'edit-stop-loss':
                case 'edit-take-profit':
                    i = findOrder(intent.orderId);
                    if (i >= 0) {
                        var ch = intent.changes || intent;
                        var patch = {};
                        if (ch.price !== undefined) patch.price = ch.price;
                        if (ch.stopPrice !== undefined) patch.stopPrice = ch.stopPrice;
                        if (ch.quantity !== undefined) patch.quantity = ch.quantity;
                        orders[i] = bump(Object.assign({}, orders[i], patch));
                        pushOrders();
                    }
                    break;
                case 'cancel-order':
                case 'remove-stop-loss':
                case 'remove-take-profit':
                    i = findOrder(intent.orderId);
                    if (i >= 0) { orders.splice(i, 1); pushOrders(); }
                    break;
                case 'place-order':
                    var id = 'ord-' + (++placeSeq);
                    var req = intent.order;
                    orders.push({
                        id: id, side: req.side, type: req.type, status: 'working',
                        timeInForce: req.timeInForce, quantity: req.quantity, filledQuantity: 0,
                        price: req.price, stopPrice: req.stopPrice, revision: 1,
                        permissions: { canModify: true, canCancel: true }, label: 'MANUAL',
                    });
                    pushOrders();
                    break;
                case 'close-position':
                    i = findPos(intent.positionId);
                    if (i >= 0) { positions.splice(i, 1); pushPositions(); }
                    break;
                case 'reverse-position':
                    i = findPos(intent.positionId);
                    if (i >= 0) {
                        var p = positions[i];
                        positions[i] = bump(Object.assign({}, p, { side: p.side === 'long' ? 'short' : 'long' }));
                        pushPositions();
                    }
                    break;
                case 'create-stop-loss':
                case 'create-take-profit':
                    var oid = 'prot-' + (++placeSeq);
                    var isSl = intent.kind === 'create-stop-loss';
                    orders.push({
                        id: oid, side: 'sell', type: isSl ? 'stop' : 'limit', status: 'working',
                        timeInForce: 'good-till-cancelled', quantity: intent.quantity || 1, filledQuantity: 0,
                        price: isSl ? undefined : intent.price, stopPrice: isSl ? intent.price : undefined,
                        revision: 1, permissions: { canModify: true, canCancel: true },
                        bracket: { groupId: intent.bracketGroupId || 'grp', role: isSl ? 'stop-loss' : 'take-profit', positionId: intent.positionId },
                        label: isSl ? 'SL' : 'TP',
                    });
                    pushOrders();
                    break;
            }
        }
        var placeSeq = 100;

        pushOrders();
        pushPositions();
        return {
            state: state,
            setRejectNext: function (v) { state.rejectNext = v; },
        };
    }

    function describeIntent(intent) {
        var bits = [];
        if (intent.changes && intent.changes.price !== undefined) bits.push('→ ' + intent.changes.price);
        if (intent.changes && intent.changes.stopPrice !== undefined) bits.push('stop → ' + intent.changes.stopPrice);
        if (intent.price !== undefined && intent.changes === undefined) bits.push('@ ' + intent.price);
        return bits.length ? ' ' + bits.join(' ') : '';
    }

    // ---- tiny DOM helpers ---------------------------------------------------
    function el(id) { return document.getElementById(id); }

    global.Demo = {
        prng: prng,
        PALETTES: PALETTES,
        chartTheme: chartTheme,
        applyCssPalette: applyCssPalette,
        genCandles: genCandles,
        genExactBars: genExactBars,
        genTpoBars: genTpoBars,
        makeArrayFeed: makeArrayFeed,
        makeFakeBroker: makeFakeBroker,
        el: el,
        r2: r2,
    };
})(window);
