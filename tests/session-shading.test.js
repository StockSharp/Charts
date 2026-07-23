const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { PrimitiveZOrder } = require('../src/core/primitives/primitive-api.js');
const { SessionShading } = require('../src/primitives/session-shading.js');
const { TradingSessionKind } = require('../src/time/trading-calendar.js');

function calendarFixture() {
    const state = { calls: [] };
    const sessions = [
        {
            id: 'first', ruleId: 'regular', kind: 'regular', tradingDate: '2026-07-13',
            openTime: 80, closeTime: 150, isOverride: false,
        },
        {
            id: 'second', ruleId: 'regular', kind: 'regular', tradingDate: '2026-07-14',
            openTime: 180, closeTime: 220, isOverride: false,
        },
    ];
    return {
        state,
        schedule: () => ({ timeZone: 'UTC', sessions: [] }),
        sessionsInRange(range, kinds) {
            state.calls.push({ range, kinds });
            return sessions;
        },
        sessionAt: () => null,
        isTradingTime: () => false,
        nextSession: () => null,
        previousSession: () => null,
    };
}

describe('SessionShading', () => {
    it('queries the visible range once and paints clipped session rectangles', () => {
        const calendar = calendarFixture();
        const shading = new SessionShading({
            id: 'sessions',
            calendar,
            styles: {
                [TradingSessionKind.PreMarket]: { visible: false },
                [TradingSessionKind.Regular]: { color: '#123456' },
                [TradingSessionKind.PostMarket]: { visible: false },
            },
        });
        let updates = 0;
        shading.attached({
            chart: { timeScale: () => ({ getVisibleRange: () => ({ from: 100, to: 200 }) }) },
            timeToCoordinate: (time) => 20 + time - 100,
            requestUpdate: () => updates++,
        });
        shading.updateAllViews();
        assert.equal(calendar.state.calls.length, 1);
        assert.deepEqual(calendar.state.calls[0].kinds, [TradingSessionKind.Regular]);
        assert.equal(shading.visibleSessions().length, 2);
        assert.equal(Object.isFrozen(shading.visibleSessions()), true);

        const fills = [];
        const context = {
            fillStyle: '',
            fillRect(x, y, width, height) {
                fills.push({ color: this.fillStyle, x, y, width, height });
            },
        };
        shading.paneViews()[0].renderer().draw({
            pane: {
                x: 0, y: 0, width: 140, height: 80,
                plot: { x: 20, y: 10, width: 100, height: 50 },
                isLast: true,
            },
            useMediaCoordinateSpace(consumer) {
                return consumer({ context, mediaSize: { width: 140, height: 80 } });
            },
        });
        assert.deepEqual(fills, [
            { color: '#123456', x: 20, y: 10, width: 50, height: 50 },
            { color: '#123456', x: 100, y: 10, width: 20, height: 50 },
        ]);
        assert.equal(shading.paneViews()[0].zOrder(), PrimitiveZOrder.Background);
        assert.equal(updates, 0);
    });

    it('applies style patches atomically and clears its snapshot on detach', () => {
        const calendar = calendarFixture();
        const shading = new SessionShading({ calendar });
        let updates = 0;
        shading.attached({
            chart: { timeScale: () => ({ getVisibleRange: () => ({ from: 100, to: 200 }) }) },
            timeToCoordinate: (time) => time,
            requestUpdate: () => updates++,
        });
        const originalPreColor = shading.options().styles['pre-market'].color;
        shading.applyOptions({ styles: { regular: { color: '#abcdef', visible: false } } });
        assert.equal(shading.options().styles.regular.color, '#abcdef');
        assert.equal(shading.options().styles.regular.visible, false);
        assert.equal(shading.options().styles['pre-market'].color, originalPreColor);
        assert.equal(updates, 1);
        assert.throws(() => shading.applyOptions({
            styles: { regular: { color: '' } },
            zOrder: PrimitiveZOrder.Top,
        }), /color/);
        assert.equal(shading.options().zOrder, PrimitiveZOrder.Background);
        assert.equal(shading.options().styles.regular.color, '#abcdef');

        shading.detached();
        assert.deepEqual(shading.visibleSessions(), []);
    });
});
