const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { builtInSeriesDefinitions } = require('../src/series/built-in-renderers.js');

function recordingContext() {
    const strokes = [];
    let dash = [];
    const context = {
        strokeStyle: '',
        lineWidth: 0,
        fillStyle: '',
        fillCalls: 0,
        beginPath() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        fill() { this.fillCalls++; },
        setLineDash(value) { dash = [...value]; },
        stroke() {
            strokes.push({
                color: this.strokeStyle,
                width: this.lineWidth,
                dash: [...dash],
            });
        },
    };
    return { context, strokes };
}

describe('built-in series renderers', () => {
    it('styles and hides Band boundaries independently from its fill', () => {
        const band = builtInSeriesDefinitions.find(item => item.type === 'Band');
        const { context, strokes } = recordingContext();

        band.renderer.draw({
            target: context,
            data: [
                { time: 1, upper: 12, lower: 8 },
                { time: 2, upper: 13, lower: 9 },
            ],
            allData: [],
            options: {
                upperColor: '#00aa00',
                lowerColor: '#aa0000',
                upperLineVisible: false,
                lowerLineWidth: 4,
                lowerLineStyle: 2,
                fillVisible: false,
            },
            priceRange: { min: 0, max: 20 },
            visibleTimeRange: { from: 1, to: 2 },
            pane: { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 },
            theme: {
                fontFamily: 'sans-serif', textColor: '#fff',
                horizontalGridColor: '#000', verticalGridColor: '#000',
            },
            barSpacing: 8,
            metadata: {},
            timeToCoordinate: value => value * 10,
            priceToCoordinate: value => value,
        });

        assert.equal(context.fillCalls, 0);
        assert.deepEqual(strokes, [{ color: '#aa0000', width: 4, dash: [12, 8] }]);
    });

    it('does not distribute legacy candle volume into fabricated price bins', () => {
        const profile = builtInSeriesDefinitions.find(item => item.type === 'VolumeProfile');
        const calls = [];
        const context = {
            globalAlpha: 1,
            fillStyle: '',
            font: '',
            textAlign: '',
            textBaseline: '',
            fillRect() { calls.push('profile-bar'); },
            fillText(value) { calls.push(value); },
        };

        profile.renderer.draw({
            target: context,
            data: [{ time: 1, open: 10, high: 20, low: 10, close: 15, vol: 1_000 }],
            allData: [],
            options: {},
            priceRange: { min: 10, max: 20 },
            visibleTimeRange: { from: 1, to: 1 },
            pane: { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 },
            theme: {
                fontFamily: 'sans-serif', textColor: '#fff',
                horizontalGridColor: '#000', verticalGridColor: '#000',
            },
            barSpacing: 8,
            metadata: {},
            timeToCoordinate: value => value,
            priceToCoordinate: value => value,
        });

        assert.deepEqual(calls, ['Exact footprint levels required']);
    });
});
