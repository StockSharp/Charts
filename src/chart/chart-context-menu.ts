// Chart Context Menu — replaces the browser's default right-click menu
// (Image / Copy / Save — useless on a chart canvas) with a trading-flavoured
// menu and Ctrl+click shortcuts:
//
//   right-click            → floating menu at cursor with Buy / Sell @ price,
//                            Add indicator, Cancel orders at level
//   Ctrl + left click      → prefill order-entry Buy side with the clicked
//                            price and flash the side panel
//   Ctrl + right click     → same for Sell side
//
// We never submit an order automatically — clicking just seeds the order-entry
// form. The user still has to press Place. A misclick on a $50k BTC bar must
// not turn into a real order.
//
// Wire-up: terminal-app calls init(containerEl, candleSeries, hooks). Hooks
// are framework-agnostic callbacks so this class can live without knowing
// OrderEntryWidget or IndicatorDialog directly.

import { T } from './i18n.js';
// NOTE: IndicatorDialog / OrderEntryWidget imports dropped for the standalone
// library — this menu only ever talks to them through the optional _hooks
// callbacks (onAddIndicator / onBuyAtPrice / …), never by symbol.

export class ChartContextMenu {
    _container: HTMLElement | null;
    _series: any;
    _hooks: any;
    _menuEl: HTMLDivElement | null;
    _onContextMenu: ((e: MouseEvent) => void) | null;
    _onMouseDown: ((e: MouseEvent) => void) | null;
    _onDocClick: ((e: MouseEvent) => void) | null;
    _onEsc: ((e: KeyboardEvent) => void) | null;

    constructor() {
        this._container = null;
        this._series = null;
        this._hooks = null;
        this._menuEl = null;

        this._onContextMenu = null;
        this._onMouseDown = null;
        this._onDocClick = null;
        this._onEsc = null;
    }

    /// Attach handlers and build the menu DOM. Idempotent — re-calls
    /// dispose() first so callers can re-init after a chart rebuild
    /// (timeframe / symbol change recreates the candle series).
    init(containerEl, candleSeries, hooks) {
        if (!containerEl) return;
        this.dispose();

        this._container = containerEl;
        this._series = candleSeries;
        this._hooks = hooks || {};

        // Floating menu lives on body so it floats above panel-resizers and
        // GoldenLayout splitters. Positioned absolute at click coordinates.
        this._menuEl = document.createElement('div');
        this._menuEl.className = 'chart-ctx-menu';
        this._menuEl.style.display = 'none';
        document.body.appendChild(this._menuEl);

        this._onContextMenu = (e) => this._handleContextMenu(e);
        this._onMouseDown = (e) => this._handleMouseDown(e);
        this._onDocClick = (e) => {
            if (this._menuEl && !this._menuEl.contains(e.target as Node)) this._hideMenu();
        };
        this._onEsc = (e) => { if (e.key === 'Escape') this._hideMenu(); };

        this._container!.addEventListener('contextmenu', this._onContextMenu as EventListener);
        this._container!.addEventListener('mousedown', this._onMouseDown as EventListener);
        document.addEventListener('click', this._onDocClick as EventListener);
        document.addEventListener('keydown', this._onEsc as EventListener);
    }

    /// Update the candle series reference — chart-type-switcher swaps in a
    /// new series on each candle/line/area/bar toggle, so the coord→price
    /// conversion needs the latest one to stay accurate.
    setCandleSeries(series) {
        this._series = series;
    }

    dispose() {
        if (this._container && this._onContextMenu) {
            this._container.removeEventListener('contextmenu', this._onContextMenu as EventListener);
            this._container.removeEventListener('mousedown', this._onMouseDown as EventListener);
        }
        document.removeEventListener('click', (this._onDocClick || (() => {})) as EventListener);
        document.removeEventListener('keydown', (this._onEsc || (() => {})) as EventListener);
        if (this._menuEl) { try { this._menuEl.remove(); } catch {} }
        this._container = null;
        this._series = null;
        this._hooks = null;
        this._menuEl = null;
    }

    _priceAt(clientY) {
        if (!this._series || !this._container) return null;
        const rect = this._container.getBoundingClientRect();
        const y = clientY - rect.top;
        try {
            const p = this._series.coordinateToPrice(y);
            return (typeof p === 'number' && Number.isFinite(p)) ? p : null;
        } catch {
            return null;
        }
    }

    _handleMouseDown(e) {
        // Only Ctrl-modified clicks. Plain right-click still pops the menu
        // via the contextmenu event. Shift / Alt left alone so they stay
        // available for drawing-tool modifiers.
        if (!e.ctrlKey) return;
        // Browser fires contextmenu on right-mousedown; that handler will
        // also see ctrlKey and route to the same hook. Suppress the menu so
        // Ctrl+right doesn't show menu AND fire sell — pick one path
        // (mousedown) and short-circuit the other (contextmenu).
        if (e.button !== 0 && e.button !== 2) return;

        e.preventDefault();
        e.stopPropagation();
        this._hideMenu();

        const price = this._priceAt(e.clientY);
        if (price == null) return;

        if (e.button === 0 && this._hooks.onBuyAtPrice)
            this._hooks.onBuyAtPrice(price);
        else if (e.button === 2 && this._hooks.onSellAtPrice)
            this._hooks.onSellAtPrice(price);
    }

    _handleContextMenu(e) {
        // Ctrl+right was handled by mousedown — just suppress the browser menu.
        if (e.ctrlKey) { e.preventDefault(); return; }

        e.preventDefault();
        const price = this._priceAt(e.clientY);
        this._showMenu(e.clientX, e.clientY, price);
    }

    _showMenu(x, y, price) {
        if (!this._menuEl) return;

        // i18n.js exposes `const T = { t(key, ...args) }` at script-scope.
        // window.T is a separate Razor-injected flat dict (no .t method) — using
        // it here would fall through to the identity fn and leave labels English.
        const t = (typeof T !== 'undefined' && T.t) ? T.t.bind(T) : (s: string) => s;

        let items: any[];
        if (this._hooks.paneMode) {
            // Sub-pane menu: the same right-click affordance as the main chart,
            // scoped to the pane — add a study into THIS pane, or drop the pane.
            // No order/price actions (a sub-pane isn't the price axis).
            items = [
                {
                    key: 'addToPane', label: t('Add indicator…'),
                    action: () => this._hooks.onAddIndicator && this._hooks.onAddIndicator(),
                },
                { separator: true },
                {
                    key: 'removePane', label: t('Remove pane'), cls: 'chart-ctx-sell',
                    disabled: !this._hooks.onRemovePane,
                    action: () => this._hooks.onRemovePane && this._hooks.onRemovePane(),
                },
            ];
        } else {
            const fmt = (typeof window.TerminalUtils !== 'undefined' && window.TerminalUtils.formatPrice)
                ? window.TerminalUtils.formatPrice
                : (p: any) => String(p);

            const priceLabel = price != null ? fmt(price) : '--';
            const hasPrice = price != null;

            // Hit-test the orders cache at this price level so the menu can
            // (a) show a count, (b) disable the entry when nothing matches.
            // Hook is optional — if the host didn't wire findOrdersAtPrice we
            // fall back to "enabled when onCancelOrdersAt is wired" so the entry
            // is still callable (the action handler itself toasts on no-match).
            let cancelCount = 0;
            if (hasPrice && typeof this._hooks.findOrdersAtPrice === 'function') {
                try {
                    const matches = this._hooks.findOrdersAtPrice(price);
                    cancelCount = Array.isArray(matches) ? matches.length : 0;
                } catch (err) { console.warn('[ctx-menu] findOrdersAtPrice', err); }
            }
            const cancelLabel = cancelCount > 0
                ? t('Cancel {0} orders at {1}', cancelCount, priceLabel)
                : t('Cancel orders at this price');
            const cancelDisabled = !hasPrice
                || !this._hooks.onCancelOrdersAt
                || (typeof this._hooks.findOrdersAtPrice === 'function' && cancelCount === 0);

            items = [
                {
                    key: 'buy', label: `${t('Buy')} @ ${priceLabel}`,
                    cls: 'chart-ctx-buy', disabled: !hasPrice,
                    action: () => this._hooks.onBuyAtPrice && this._hooks.onBuyAtPrice(price),
                },
                {
                    key: 'sell', label: `${t('Sell')} @ ${priceLabel}`,
                    cls: 'chart-ctx-sell', disabled: !hasPrice,
                    action: () => this._hooks.onSellAtPrice && this._hooks.onSellAtPrice(price),
                },
                { separator: true },
                {
                    key: 'indicator', label: t('Add indicator…'),
                    action: () => this._hooks.onAddIndicator && this._hooks.onAddIndicator(),
                },
                {
                    key: 'addPane', label: t('Add pane…'),
                    disabled: !this._hooks.onAddPane,
                    action: () => this._hooks.onAddPane && this._hooks.onAddPane(),
                },
                {
                    key: 'cancelOrders', label: cancelLabel,
                    disabled: cancelDisabled,
                    action: () => this._hooks.onCancelOrdersAt && this._hooks.onCancelOrdersAt(price),
                },
            ];
        }

        this._menuEl.innerHTML = '';
        for (const it of items) {
            if (it.separator) {
                const sep = document.createElement('div');
                sep.className = 'chart-ctx-sep';
                this._menuEl.appendChild(sep);
                continue;
            }
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `chart-ctx-item ${it.cls || ''}`.trim();
            btn.textContent = it.label;
            if (it.disabled) {
                btn.disabled = true;
            } else {
                btn.addEventListener('click', () => {
                    this._hideMenu();
                    try { it.action(); } catch (err) { console.warn('[ctx-menu]', err); }
                });
            }
            this._menuEl.appendChild(btn);
        }

        // Native :fullscreen на chart-panel кладёт её в top-layer браузера;
        // элементы из document.body (где живёт menuEl) оказываются ПОД ним
        // и контекст-меню становится невидимым. Перевешиваем меню внутрь
        // fullscreen-элемента, чтобы оно тоже попало в top-layer.
        const fsEl = (document as any).fullscreenElement || (document as any).webkitFullscreenElement;
        const target = fsEl || document.body;
        if (this._menuEl.parentElement !== target) target.appendChild(this._menuEl);

        // Position then reveal — clamp inside viewport so the menu doesn't
        // run off the right/bottom edge on clicks near the chart corner.
        this._menuEl.style.display = 'block';
        const w = this._menuEl.offsetWidth;
        const h = this._menuEl.offsetHeight;
        const maxX = window.innerWidth - w - 4;
        const maxY = window.innerHeight - h - 4;
        this._menuEl.style.left = Math.min(x, maxX) + 'px';
        this._menuEl.style.top = Math.min(y, maxY) + 'px';
    }

    _hideMenu() {
        if (this._menuEl) this._menuEl.style.display = 'none';
    }
}
