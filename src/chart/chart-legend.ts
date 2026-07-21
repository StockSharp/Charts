// Chart Legend — OHLCV overlay + indicator values on crosshair move
import { T } from './i18n.js';
import { ChartPaneManager } from './chart-pane-manager.js';
import { TerminalUtils } from './utils.js';

export class ChartLegend {
    _el: HTMLElement | null;
    _chart: any;
    _rawCandles: any[];
    _indicatorEngine: any;
    _isHovered: boolean = false;
    _lastIndSignature: string | undefined;
    _lastSubPaneIds: Set<any> | undefined;
    onEditIndicator: ((id: number, type: string) => void) | null = null;
    onChartTypeChange: ((type: string) => void) | null = null;
    _currentChartType: string = 'candle';

    constructor() {
        this._el = null;
        this._chart = null;
        this._rawCandles = [];
        this._indicatorEngine = null;
    }

    init(legendId, chart) {
        this._el = document.getElementById(legendId);
        this._chart = chart;
        if (!this._el || !this._chart) return;

        // Freeze the indicator strip while the cursor is over a clickable
        // row — `_isHovered` gates _renderIndicators so live ticks AND
        // crosshair-move both stop changing the numbers, the row sits
        // perfectly still, and the user can aim at × / ✎ without the
        // target moving. CSS already sets pointer-events:auto on
        // .legend-indicator so the chart's crosshair-move doesn't fire
        // while hovering; this hover flag covers the indicator-engine
        // RAF-driven repaint path as well.
        this._isHovered = false;
        this._el.addEventListener('mouseenter', () => {
            this._isHovered = true;
            // Drop the on-chart vertical crosshair line immediately — LWC
            // leaves the last position drawn unless we tell it to clear,
            // which would otherwise still ghost the bar behind the legend.
            try { this._chart.clearCrosshairPosition?.(); } catch {}
        });
        this._el.addEventListener('mouseleave', () => { this._isHovered = false; });

        this._chart.subscribeCrosshairMove((param) => {
            this._onCrosshairMove(param);
        });

        // Delegate click on edit / remove / chart-type buttons (legend re-renders on crosshair move).
        this._el.addEventListener('click', (e) => {
            const tgt = e.target as Element | null;
            const removeBtn = tgt?.closest('.legend-remove-btn') as HTMLElement | null;
            if (removeBtn) {
                const id = parseInt(removeBtn.dataset.indId!);
                if (this._indicatorEngine) this._indicatorEngine.remove(id);
                return;
            }
            const editBtn = tgt?.closest('.legend-edit-btn') as HTMLElement | null;
            if (editBtn) {
                const id = parseInt(editBtn.dataset.indId!);
                const type = editBtn.dataset.indType!;
                if (this.onEditIndicator) this.onEditIndicator(id, type);
                return;
            }
            const ctItem = tgt?.closest('.legend-ct-item') as HTMLElement | null;
            if (ctItem) {
                const newType = ctItem.dataset.type!;
                this.setChartType(newType);
                if (this.onChartTypeChange) this.onChartTypeChange(newType);
                // Close the menu
                const menu = this._el?.querySelector('.legend-ct-menu') as HTMLElement | null;
                if (menu) menu.style.display = 'none';
                return;
            }
            const ctToggle = tgt?.closest('.legend-ct-toggle') as HTMLElement | null;
            if (ctToggle) {
                e.stopPropagation();
                // Создаём floating menu в document.body — legend HTML
                // пересоздаётся на каждый tick, и menu внутри него
                // мгновенно выкидывалось из DOM. Body-level плюс
                // position:fixed = живёт пока юзер не выберет item или
                // не кликнет вне.
                document.querySelectorAll('.chart-legend-floating-ct-menu').forEach(m => m.remove());
                const items: Array<[string, string, string]> = [
                    ['candle', 'bi-bar-chart-fill', T.t('Candlestick')],
                    ['bar', 'bi-bar-chart-steps', T.t('Bar')],
                    ['line', 'bi-graph-up', T.t('Line')],
                    ['area', 'bi-graph-down-arrow', T.t('Area')],
                    ['heikin', 'bi-bar-chart-steps', T.t('HeikinAshi')],
                    ['renko', 'bi-bricks', T.t('Renko')],
                    ['pf', 'bi-x-diamond', T.t('Point & Figure')],
                    ['cluster', 'bi-bar-chart-line-fill', T.t('Cluster')],
                    ['box', 'bi-grid-3x3-gap-fill', T.t('Box')],
                ];
                const menu = document.createElement('div');
                menu.className = 'chart-legend-floating-ct-menu dropdown-menu';
                menu.innerHTML = items.map(([t, ic, lbl]) =>
                    `<button type="button" class="legend-ct-item dropdown-item" data-type="${t}"><i class="bi ${ic}"></i> ${lbl}</button>`
                ).join('');
                const r = ctToggle.getBoundingClientRect();
                menu.style.cssText = `position:fixed;top:${r.bottom + 4}px;left:${r.left}px;z-index:99999;display:block;min-width:140px;`;
                ((document as any).fullscreenElement || (document as any).webkitFullscreenElement || document.body).appendChild(menu);
                menu.addEventListener('click', (ev) => {
                    const item = (ev.target as HTMLElement).closest('.legend-ct-item') as HTMLElement | null;
                    if (!item) return;
                    const newType = item.dataset.type!;
                    this.setChartType(newType);
                    if (this.onChartTypeChange) this.onChartTypeChange(newType);
                    menu.remove();
                });
                // Close on outside click (delay so this very click doesn't trigger).
                setTimeout(() => {
                    document.addEventListener('click', function close(ev) {
                        if (!menu.contains(ev.target as Node)) {
                            menu.remove();
                            document.removeEventListener('click', close);
                        }
                    });
                }, 0);
            }
        });
    }

    setChartType(type) {
        this._currentChartType = type;
        // Repaint legend so the toggle button reflects the new type.
        if (this._rawCandles.length > 0) {
            this._renderOHLCV(this._rawCandles[this._rawCandles.length - 1]);
        }
    }

    setRawCandles(candles) {
        this._rawCandles = candles || [];
        // Once the first batch of candles lands we can paint the legend even
        // if the user hasn't hovered — guarantees the × / ✏ buttons exist
        // next to any already-active indicators.
        if (this._indicatorEngine && this._indicatorEngine.getIndicators().length > 0) {
            this.refresh();
        }
    }

    setIndicatorEngine(engine) {
        this._indicatorEngine = engine;
        // Re-render the indicator strip whenever the set of active indicators
        // changes — add() / remove() / replaceParams() all fire onChange. Prior
        // to this, the legend stayed empty until the user happened to hover
        // the chart, which meant freshly-added indicators had no × button to
        // click (and on mobile there's no hover at all).
        if (engine) {
            const prev = engine.onChange;
            engine.onChange = () => {
                if (prev) prev();
                this.refresh();
            };
        }
    }

    // Paint the legend using the latest bar — safe to call any time indicators
    // change. Mirrors the "no-hover" branch of _onCrosshairMove.
    refresh() {
        if (!this._el) return;
        if (this._rawCandles.length > 0) {
            const last = this._rawCandles[this._rawCandles.length - 1];
            this._renderOHLCV(last);
            this._renderIndicators(last.time);
        } else {
            // No candles yet — still put the .legend-indicators span in place
            // so _renderIndicators has something to fill when indicators arrive.
            if (!this._el.querySelector('.legend-indicators')) {
                this._el.innerHTML = '<span class="legend-ohlcv"></span><span class="legend-indicators"></span>';
            }
            this._renderIndicators(0);
        }
    }

    _onCrosshairMove(param) {
        if (!this._el) return;

        if (!param.time || param.point === undefined) {
            // Show last candle
            if (this._rawCandles.length > 0) {
                const last = this._rawCandles[this._rawCandles.length - 1];
                this._renderOHLCV(last);
                this._renderIndicators(last.time);
            }
            return;
        }

        // Find candle at this time
        const time = param.time;
        const candle = this._rawCandles.find(c => c.time === time);
        if (candle) {
            this._renderOHLCV(candle);
        }
        this._renderIndicators(time);
    }

    _renderOHLCV(candle) {
        if (!this._el) return;

        const isUp = candle.close >= candle.open;
        const cls = isUp ? 'legend-up' : 'legend-down';
        // Dynamic precision: для TWT/IMEX (~0.44) фиксированный toFixed(2)
        // схлопывал OHLC в один и тот же "0.44" → юзеру казалось что свечи
        // не обновляются. Берём количество знаков из абсолютной величины
        // цены — пенни-стоки получают 4-5, крупные тикеры — 2.
        const precFor = (v: number) => {
            const a = Math.abs(v);
            if (a >= 1000) return 1;
            if (a >= 100) return 2;
            if (a >= 1) return 3;
            if (a >= 0.01) return 4;
            return 6;
        };
        const refPrice = (candle.close ?? candle.open ?? 1);
        const prec = precFor(refPrice);
        const fmt = (v) => v !== undefined && v !== null ? v.toFixed(prec) : '--';

        let html = `<span class="legend-item legend-time">${this._formatTime(candle.time)}</span>`;
        html += `<span class="legend-item">O <span class="${cls}">${fmt(candle.open)}</span></span>`;
        html += `<span class="legend-item">H <span class="${cls}">${fmt(candle.high)}</span></span>`;
        html += `<span class="legend-item">L <span class="${cls}">${fmt(candle.low)}</span></span>`;
        html += `<span class="legend-item">C <span class="${cls}">${fmt(candle.close)}</span></span>`;
        if (candle.volume !== undefined) {
            html += `<span class="legend-item">V <span class="legend-vol">${this._formatVol(candle.volume)}</span></span>`;
        }
        // Per-pane chart-type selector. Mini-dropdown right at the end of the
        // OHLC strip so the user can change rendering (candle/bar/line/area/
        // heikin) for THIS particular chart pane without touching the global
        // toolbar — необходимо для multi-chart layout.
        // Per-pane chart-type selector. ТОЛЬКО toggle-кнопка в HTML
        // легенды — само меню создаётся в document.body при клике
        // (см. click handler в init). Без этого _renderOHLCV пересоздавал
        // legend HTML на каждый tick и menu, открытое юзером, мгновенно
        // выкидывалось из DOM.
        const CT_ICONS: Record<string, string> = {
            candle: 'bi-bar-chart-fill',
            bar: 'bi-bar-chart-steps',
            line: 'bi-graph-up',
            area: 'bi-graph-down-arrow',
            heikin: 'bi-bar-chart-steps',
            renko: 'bi-bricks',
            pf: 'bi-x-diamond',
            cluster: 'bi-bar-chart-line-fill',
            box: 'bi-grid-3x3-gap-fill',
        };
        const ct = this._currentChartType || 'candle';
        html += `<span class="legend-item legend-ct"><button class="legend-ct-toggle btn-toolbar" title="${T.t('Chart')}" type="button" data-current="${ct}"><i class="bi ${CT_ICONS[ct] || 'bi-bar-chart-fill'}"></i><i class="bi bi-caret-down-fill" style="font-size:8px;margin-left:3px;"></i></button></span>`;

        // Indicator values
        const indHtml = this._el.querySelector('.legend-indicators');
        if (indHtml) {
            const ohlcv = this._el.querySelector('.legend-ohlcv');
            if (ohlcv) ohlcv.innerHTML = html;
        } else {
            this._el.innerHTML = `<span class="legend-ohlcv">${html}</span><span class="legend-indicators"></span>`;
        }
    }

    _renderIndicators(time) {
        if (!this._indicatorEngine || !this._el) return;
        // Freeze updates while the cursor is over the legend row — see init().
        if (this._isHovered) return;

        const indEl = this._el.querySelector('.legend-indicators');
        if (!indEl) return;

        // Only overlay (main-chart) indicators belong in this legend —
        // sub-pane indicators have their own pane headers, painted below.
        const all = this._indicatorEngine.getValuesAt(time);
        const values = all.filter(v => v.paneId == null);
        const signature = values.map(v => v.id).join(',');
        // Sub-pane values: group by paneId and push to each pane's header.
        this._paintSubPaneValues(all.filter(v => v.paneId != null));

        // Rebuild the DOM ONLY when the indicator set changes — on every
        // crosshair move we just update the numeric text inside existing spans.
        // Keeps the edit/remove buttons' nodes stable so clicks register even
        // while the mouse is moving (mousedown / mouseup on a DOM node that
        // disappears between the two events silently drops the click).
        if (signature !== this._lastIndSignature) {
            this._lastIndSignature = signature;
            indEl.innerHTML = '';
            for (const ind of values) {
                const row = document.createElement('span');
                row.className = 'legend-indicator';
                row.dataset.indId = ind.id;

                // Multi-output indicators (Ichimoku → 5 values, MACD → 3, …)
                // used to spell every inner series name inline:
                //   "tenkan: 77892 kijun: 77913 senkouA: 78032 …"
                // which ate a whole screen-width. Instead: print the
                // indicator's short name once, then just the numbers in
                // the matching series colour. Inner names go in the
                // `title` tooltip for anyone who needs them.
                const valueKeys = Object.keys(ind.values);
                const singleVal = valueKeys.length === 1 && valueKeys[0] === 'value';

                if (!singleVal) {
                    const nameEl = document.createElement('span');
                    nameEl.className = 'legend-ind-name';
                    nameEl.textContent = ind.name;
                    row.appendChild(nameEl);
                }

                valueKeys.forEach((key, i) => {
                    const color = ind.colors[i] || '#fff';
                    const v = document.createElement('span');
                    v.className = 'legend-value';
                    v.dataset.key = key;
                    v.style.color = color;
                    // Inner series name as tooltip for multi-output rows
                    // (hoverable on desktop; falls back to no tooltip on touch).
                    if (!singleVal) v.title = key;
                    v.textContent = singleVal ? `${ind.name}: --` : '--';
                    row.appendChild(document.createTextNode(' '));
                    row.appendChild(v);
                });

                const edit = document.createElement('span');
                edit.className = 'legend-edit-btn';
                edit.dataset.indId = ind.id;
                edit.dataset.indType = ind.type;
                edit.title = T.t('Edit');
                edit.innerHTML = '&#9998;';

                const remove = document.createElement('span');
                remove.className = 'legend-remove-btn';
                remove.dataset.indId = ind.id;
                remove.title = T.t('Remove');
                remove.innerHTML = '&times;';

                row.appendChild(document.createTextNode(' '));
                row.appendChild(edit);
                row.appendChild(document.createTextNode(' '));
                row.appendChild(remove);

                indEl.appendChild(row);
            }
        }

        // Update values in-place on the existing DOM.
        for (const ind of values) {
            const row = indEl.querySelector(`.legend-indicator[data-ind-id="${ind.id}"]`);
            if (!row) continue;
            const valueKeys = Object.keys(ind.values);
            const singleVal = valueKeys.length === 1 && valueKeys[0] === 'value';
            row.querySelectorAll('.legend-value').forEach((v: Element) => {
                const ve = v as HTMLElement;
                const key = ve.dataset.key!;
                const raw = ind.values[key];
                if (raw == null) {
                    // A sparse single-output indicator still needs its name on
                    // candles where it has no marker/value.
                    ve.textContent = singleVal ? `${ind.name}: --` : '';
                    return;
                }
                // Single-output keeps "NAME: value"; multi-output prints
                // just the number (the name is already once at row start).
                const text = TerminalUtils.formatPrice(raw);
                ve.textContent = singleVal ? `${ind.name}: ${text}` : text;
            });
        }
    }

    /// <summary>
    /// Paints indicator values inside each sub-pane header via
    /// ChartPaneManager.setPaneValuesHtml. Grouped by paneId so two
    /// indicators sharing the same Percent pane (RSI + Stochastic)
    /// render side by side. No edit/remove buttons here — those live on
    /// the main legend for now; sub-pane close still via the ×.
    /// </summary>
    _paintSubPaneValues(subValues) {
        const paneMgr = window._chartPaneManager;
        if (!paneMgr) return;

        const groups: Map<any, any[]> = new Map();
        for (const v of subValues) {
            if (!groups.has(v.paneId)) groups.set(v.paneId, []);
            groups.get(v.paneId)!.push(v);
        }

        // Clear panes that no longer have anything — so removing the last
        // indicator from a pane (before the pane itself is destroyed)
        // doesn't leave stale text in the header.
        for (const paneId of (this._lastSubPaneIds || new Set())) {
            if (!groups.has(paneId)) paneMgr.setPaneValuesHtml(paneId, '');
        }
        this._lastSubPaneIds = new Set(groups.keys());

        const esc = (s: any) => String(s).replace(/[&<>"']/g, c => (({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        } as Record<string, string>))[c]);
        const fmt = (n) => n == null ? '' : TerminalUtils.formatPrice(n);

        for (const [paneId, inds] of groups) {
            const groupsHtml: string[] = [];
            for (const ind of inds) {
                const valueKeys = Object.keys(ind.values);
                const singleVal = valueKeys.length === 1 && valueKeys[0] === 'value';
                const valueParts: string[] = [];
                // Leading indicator name once (for multi-output), then just
                // the coloured numbers — mirrors the main-legend format so
                // ADX "DMI: X Wilder MA: Y" becomes "ADX X Y".
                if (!singleVal) {
                    valueParts.push(`<span class="pane-ind-name">${esc(ind.name)}</span>`);
                }
                for (let i = 0; i < valueKeys.length; i++) {
                    const key = valueKeys[i];
                    const v = ind.values[key];
                    if (v == null) continue;
                    const color = ind.colors[i] || '#d0d6de';
                    const text = singleVal ? `${esc(ind.name)}: ${fmt(v)}` : fmt(v);
                    const tip = singleVal ? '' : ` title="${esc(key)}"`;
                    valueParts.push(`<span class="pane-value" style="color:${color};"${tip}>${text}</span>`);
                }
                // Each indicator gets its own edit + remove buttons so two
                // Percent indicators sharing a pane (RSI + Stochastic, or
                // two ADXes) can be managed independently.
                const edit = `<span class="legend-edit-btn" data-ind-id="${ind.id}" data-ind-type="${esc(ind.type)}" title="${esc(T.t('Edit'))}">&#9998;</span>`;
                const rem = `<span class="legend-remove-btn" data-ind-id="${ind.id}" title="${esc(T.t('Remove'))}">&times;</span>`;
                groupsHtml.push(`<span class="legend-indicator">${valueParts.join(' ')} ${edit} ${rem}</span>`);
            }
            paneMgr.setPaneValuesHtml(paneId, groupsHtml.join(' '));
        }
    }

    _formatTime(t) {
        if (t === undefined || t === null) return '';
        const d = new Date(t * 1000);
        const pad = (n) => n < 10 ? '0' + n : '' + n;
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    _formatVol(v) {
        if (v == null || !isFinite(v)) return '--';
        if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
        if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
        if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
        if (v >= 1) return v.toFixed(0);
        // Fractional volumes (crypto): preserve up to 8 significant decimals, trim trailing zeros
        return v.toLocaleString(undefined, { maximumFractionDigits: 8 });
    }
}
