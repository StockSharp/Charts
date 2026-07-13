// Minimal TerminalUtils port for the standalone chart library. The full
// terminal utils.ts carries order/pnl/time formatters and a status-clock timer
// that the chart stack never touches; the chart modules (chart-legend,
// indicator-dialog, chart-context-menu) use exactly two helpers — formatPrice
// and showToast — so only those are ported here.
import { T } from './i18n.js';

export const TerminalUtils = {
    // Price formatting with dynamic precision (pennies get more decimals, big
    // tickers fewer). Pure math, no DOM.
    formatPrice(price: any, decimals?: number): string {
        if (price == null || isNaN(price)) return '--';
        const n = Number(price);
        if (decimals != null) return n.toFixed(decimals);
        const a = Math.abs(n);
        let prec = 2;
        if (a < 1) prec = 4;
        if (a < 0.1) prec = 5;
        if (a < 0.001) prec = 6;
        if (a >= 1000) prec = 1;
        if (a >= 10000) prec = 0;
        return n.toFixed(prec);
    },

    // Transient toast; auto-dismisses unless it is an error/warning (those get a
    // close button). Styled via the .terminal-toast* CSS shipped with the demo.
    showToast(message: string, type: string = 'success'): void {
        const el = document.createElement('div');
        el.className = 'terminal-toast ' + type;
        const isImportant = type === 'error' || type === 'warning';
        const text = document.createElement('span');
        text.className = 'terminal-toast-msg';
        text.textContent = message;
        el.appendChild(text);
        if (isImportant) {
            const close = document.createElement('span');
            close.className = 'terminal-toast-close';
            close.textContent = '×';
            close.title = T.t('Close');
            close.addEventListener('click', () => el.remove());
            el.appendChild(close);
        }
        document.body.appendChild(el);
        if (!isImportant) {
            setTimeout(() => {
                el.classList.add('hiding');
                el.addEventListener('animationend', () => el.remove());
            }, 2500);
        }
    },
};
