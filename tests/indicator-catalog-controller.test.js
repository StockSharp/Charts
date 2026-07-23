const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    IndicatorCatalogController,
} = require('../src/workspace/indicator-catalog-controller.js');

const entries = [
    {
        id: 'AwesomeOscillator',
        name: 'Awesome Oscillator',
        fullName: 'Awesome Oscillator',
        category: 'momentum',
        categoryLabel: 'Momentum',
        aliases: ['ao'],
    },
    {
        id: 'RelativeStrengthIndex',
        name: 'RSI',
        fullName: 'Relative Strength Index',
        category: 'momentum',
        categoryLabel: 'Momentum',
        aliases: ['rsi'],
    },
    {
        id: 'FibonacciRetracement',
        name: 'Fibonacci Retracement',
        fullName: 'Fibonacci Retracement',
        category: 'support-resistance',
        categoryLabel: 'Support & Resistance',
        aliases: ['fibo'],
    },
];

describe('IndicatorCatalogController', () => {
    it('searches every token across aliases, full names and category metadata', () => {
        const catalog = new IndicatorCatalogController({ entries });

        assert.deepEqual(catalog.search({ text: 'AO' }).map(item => item.id), [
            'AwesomeOscillator',
        ]);
        assert.deepEqual(catalog.search({ text: 'relative strength' }).map(item => item.id), [
            'RelativeStrengthIndex',
        ]);
        assert.deepEqual(catalog.search({ text: 'support resistance' }).map(item => item.id), [
            'FibonacciRetracement',
        ]);
        assert.deepEqual(catalog.search({ category: 'support-resistance' }).map(item => item.id), [
            'FibonacciRetracement',
        ]);
        assert.deepEqual(catalog.search({ category: 'Support & Resistance' }).map(item => item.id), [
            'FibonacciRetracement',
        ]);
        assert.ok(Object.isFrozen(catalog.entries()[0]));
        assert.ok(Object.isFrozen(catalog.search()));
    });

    it('merges changes made during load and serializes host-owned saves', async () => {
        let finishLoad;
        const saves = [];
        const storage = {
            load: () => new Promise(resolve => { finishLoad = resolve; }),
            save: async ids => { saves.push([...ids]); },
        };
        const catalog = new IndicatorCatalogController({ entries, storage });
        const states = [];
        catalog.subscribe(snapshot => states.push(snapshot));

        const loading = catalog.loadFavorites();
        const adding = catalog.setFavorite('AwesomeOscillator', true);
        const removing = catalog.setFavorite('RelativeStrengthIndex', false);
        finishLoad(['RelativeStrengthIndex', 'RemovedIndicator']);
        await loading;
        await adding;
        await removing;

        assert.deepEqual(catalog.favorites(), ['AwesomeOscillator']);
        assert.deepEqual(catalog.search({ favoritesOnly: true }).map(item => item.id), [
            'AwesomeOscillator',
        ]);
        assert.deepEqual(saves.at(-1), ['AwesomeOscillator']);
        assert.equal(states.at(-1).loaded, true);

        await catalog.setFavorite('RelativeStrengthIndex', true);
        assert.deepEqual(catalog.favorites(), [
            'AwesomeOscillator',
            'RelativeStrengthIndex',
        ]);
        assert.deepEqual(saves.at(-1), [
            'AwesomeOscillator',
            'RelativeStrengthIndex',
        ]);
    });

    it('rejects ambiguous catalog and preference contracts', async () => {
        assert.throws(() => new IndicatorCatalogController({
            entries: [entries[0], entries[0]],
        }), /duplicate indicator catalog id/);
        assert.throws(() => new IndicatorCatalogController({
            entries,
            storage: {},
        }), /favorites storage is invalid/);

        const catalog = new IndicatorCatalogController({
            entries,
            storage: { load: () => 'RSI', save: () => {} },
        });
        await assert.rejects(catalog.loadFavorites(), /stored favorites must be an array/);
        assert.throws(() => catalog.isFavorite('Missing'), /unknown indicator catalog id/);
    });
});
