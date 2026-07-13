// Terminal i18n helper — server injects a dictionary keyed by English text into window.__T.
// Use T.t('English text', arg1, arg2) anywhere user-visible strings are built in JS.
// Placeholders: {0}, {1}, ... are substituted positionally.
export const T = (function () {
    const dict = (typeof window !== 'undefined' && window.__T) || {};

    function t(key: string, ..._args: any[]) {
        const raw = dict[key] !== undefined ? dict[key] : key;
        if (arguments.length <= 1) return raw;
        let out = raw;
        for (let i = 1; i < arguments.length; i++) {
            out = out.split('{' + (i - 1) + '}').join(String(arguments[i]));
        }
        return out;
    }

    return { t };
})();
