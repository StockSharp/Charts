const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { PrimitiveHost } = require('../src/core/primitives/primitive-host.js');

function attach(host, primitive, options = {}) {
    host.attach(primitive, options, (services) => ({
        ...services,
        chart: {},
        pane: {},
        series: null,
        timeToCoordinate: () => null,
        coordinateToTime: () => null,
        priceToCoordinate: () => null,
        coordinateToPrice: () => null,
        pixelRatio: () => 1,
        theme: () => ({}),
    }));
}

describe('PrimitiveHost', () => {
    it('updates on attach/request and releases resources once in reverse order', () => {
        const events = [];
        let context;
        const host = new PrimitiveHost(() => events.push('invalidate'));
        const primitive = {
            attached(value) {
                events.push('attached');
                context = value;
                value.addDisposable(() => events.push('resource-a'));
                value.addDisposable({ dispose: () => events.push('resource-b') });
            },
            updateAllViews() { events.push('update'); },
            detached() { events.push('detached'); },
        };

        attach(host, primitive);
        context.requestUpdate();
        host.updateAllViews();
        assert.equal(host.size, 1);
        assert.deepEqual(host.primitives(), [primitive]);

        assert.equal(host.detach(primitive), true);
        assert.equal(host.detach(primitive), false);
        context.requestUpdate();

        assert.deepEqual(events, [
            'attached', 'update', 'invalidate',
            'invalidate', 'update',
            'detached', 'resource-b', 'resource-a', 'invalidate',
        ]);
        assert.equal(host.size, 0);
    });

    it('detaches all primitives in reverse attachment order on dispose', () => {
        const events = [];
        const host = new PrimitiveHost(() => {});
        const make = (name) => ({
            attached() {},
            updateAllViews() {},
            detached() { events.push(name); },
        });
        attach(host, make('first'));
        attach(host, make('second'));
        attach(host, make('third'));

        host.dispose();
        host.dispose();

        assert.deepEqual(events, ['third', 'second', 'first']);
        assert.equal(host.size, 0);
        assert.throws(() => attach(host, make('late')), /disposed/);
    });

    it('rolls back a failed attachment without masking its error', () => {
        const events = [];
        const host = new PrimitiveHost(() => {});
        const primitive = {
            attached(context) {
                context.addDisposable(() => events.push('resource'));
                events.push('attached');
                throw new Error('attach failed');
            },
            updateAllViews() { events.push('update'); },
            detached() {
                events.push('detached');
                throw new Error('detach also failed');
            },
        };

        assert.throws(() => attach(host, primitive), /attach failed/);
        assert.deepEqual(events, ['attached', 'detached', 'resource']);
        assert.equal(host.size, 0);
    });

    it('rejects duplicate attachment and releases dependants as a group', () => {
        const events = [];
        const host = new PrimitiveHost(() => {});
        const make = (name) => ({
            attached() {},
            updateAllViews() {},
            detached() { events.push(name); },
        });
        const panePrimitive = make('pane');
        const seriesPrimitive = make('series');
        const survivor = make('survivor');
        const pane = {};
        attach(host, panePrimitive, { pane });
        attach(host, seriesPrimitive, { pane, series: {} });
        attach(host, survivor, { pane: {} });

        assert.throws(() => attach(host, survivor), /already attached/);
        host.detachWhere((options) => options.pane === pane);

        assert.deepEqual(events, ['series', 'pane']);
        assert.deepEqual(host.primitives(), [survivor]);
    });
});
