// Globals the hosting terminal shell puts on `window`, declared in one place.
//
// This chart stack is the same code the StockSharp web terminal runs, and it reaches the shell
// through a handful of window properties rather than through imports — the shell owns the page
// and the chart is mounted into it. Every one of them is optional: the demo site and the test
// harnesses run the chart with no shell at all, which is exactly why the call sites already
// guard with `typeof ... !== 'undefined'` or `?.`.
//
// `any` on the shell-owned handles is deliberate and explicit: their real types live in the
// terminal repo, which this package does not and must not depend on. Narrowing them here would
// mean inventing a contract the shell never agreed to.

export {};

declare global {
    interface Window {
        /** Terminal formatting helpers; only `formatPrice` is used from here. */
        TerminalUtils?: {
            formatPrice?(price: unknown): string;
        };

        /** Back-reference the pane manager publishes so the legend can find it. */
        _chartPaneManager?: any;

        /** The live indicator engine, published for the pane manager and the context menu. */
        _indicatorEngine?: any;

        /** The terminal application shell — indicator add/edit dialogs live there. */
        terminalApp?: any;

        /** Server-injected i18n dictionary, keyed by the English source text. */
        __T?: Record<string, string>;
    }
}
