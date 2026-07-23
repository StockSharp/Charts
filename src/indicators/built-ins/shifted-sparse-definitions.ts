import {
    CandlestickIndicatorInput,
    IndicatorCategory,
    IndicatorMeasure,
    IndicatorPane,
    IndicatorParameterType,
    IndicatorSeriesStyle,
    type IndicatorCandle,
    type IndicatorDefinition,
    type IndicatorOutputValue,
    type IndicatorParameters,
    type IndicatorProcessInput,
} from '../indicator-definition.js';
import { registerIndicator } from '../indicator-registry.js';
import {
    SequentialIndicatorProcessor,
    type IndicatorCalculationResult,
} from '../sequential-processor.js';
import {
    RingBuffer,
    RollingMaximum,
    RollingMinimum,
    SmoothedMovingAverage,
    type RingBufferCheckpoint,
    type RollingWindowCheckpoint,
    type SmoothedMovingAverageCheckpoint,
} from '../math/index.js';

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function period(
    value: unknown,
    fallback: number,
    minimum: number,
    maximum: number,
    name: string,
): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || (resolved as number) < minimum
        || (resolved as number) > maximum) {
        throw new RangeError(
            `sschart: indicator ${name} must be an integer from ${minimum} to ${maximum}`,
        );
    }
    return resolved as number;
}

function parameter(
    values: IchimokuParameters,
    name: 'tenkan' | 'kijun' | 'senkouB',
    alias: 'tenkanPeriod' | 'kijunPeriod' | 'senkouBPeriod',
    fallback: number,
    maximum: number,
): number {
    return period(values?.[name] ?? values?.[alias], fallback, 1, maximum, name);
}

function lengthParameter(
    id: 'tenkan' | 'kijun' | 'senkouB',
    name: string,
    defaultValue: number,
    maximum: number,
) {
    return {
        id,
        name,
        type: IndicatorParameterType.Integer,
        defaultValue,
        min: 1,
        max: maximum,
        step: 1,
    } as const;
}

function lineStyle(color: string, options: Readonly<Record<string, string | number | boolean>> = {}) {
    return {
        series: IndicatorSeriesStyle.Line,
        color,
        lineWidth: 1,
        options: { priceLineVisible: false, ...options },
    } as const;
}

function alligatorParameterSchema() {
    return [
        {
            id: 'jawLength', name: 'Jaw Length', type: IndicatorParameterType.Integer,
            defaultValue: 13, min: 1, max: 200, step: 1,
        },
        {
            id: 'jawShift', name: 'Jaw Shift', type: IndicatorParameterType.Integer,
            defaultValue: 8, min: 0, max: 100, step: 1,
        },
        {
            id: 'teethLength', name: 'Teeth Length', type: IndicatorParameterType.Integer,
            defaultValue: 8, min: 1, max: 200, step: 1,
        },
        {
            id: 'teethShift', name: 'Teeth Shift', type: IndicatorParameterType.Integer,
            defaultValue: 5, min: 0, max: 100, step: 1,
        },
        {
            id: 'lipsLength', name: 'Lips Length', type: IndicatorParameterType.Integer,
            defaultValue: 5, min: 1, max: 200, step: 1,
        },
        {
            id: 'lipsShift', name: 'Lips Shift', type: IndicatorParameterType.Integer,
            defaultValue: 3, min: 0, max: 100, step: 1,
        },
    ] as const;
}

function validWindow(value: unknown, capacity: number): value is RollingWindowCheckpoint {
    if (value === null || typeof value !== 'object') return false;
    const values = (value as RollingWindowCheckpoint).values;
    return Array.isArray(values) && values.length <= capacity
        && values.every((item) => item === null || finite(item) !== null);
}

export interface IchimokuParameters extends IndicatorParameters {
    readonly tenkan: number;
    readonly kijun: number;
    readonly senkouB: number;
}

export interface FractalsParameters extends IndicatorParameters {
    readonly length: number;
}

export interface AlligatorParameters extends IndicatorParameters {
    readonly jawLength: number;
    readonly jawShift: number;
    readonly teethLength: number;
    readonly teethShift: number;
    readonly lipsLength: number;
    readonly lipsShift: number;
}

export interface AlligatorCheckpoint {
    readonly jaw: SmoothedMovingAverageCheckpoint;
    readonly teeth: SmoothedMovingAverageCheckpoint;
    readonly lips: SmoothedMovingAverageCheckpoint;
}

export interface GatorLineCheckpoint {
    readonly average: SmoothedMovingAverageCheckpoint;
    readonly delay: RingBufferCheckpoint<number | null>;
}

export interface GatorOscillatorCheckpoint {
    readonly jaw: GatorLineCheckpoint;
    readonly teeth: GatorLineCheckpoint;
    readonly lips: GatorLineCheckpoint;
}

export interface ZigZagParameters extends IndicatorParameters {
    readonly deviation: number;
}

export interface FractalWindowValue {
    readonly high: number | null;
    readonly low: number | null;
}

export interface FractalsCheckpoint {
    readonly window: RingBufferCheckpoint<FractalWindowValue>;
    readonly upCounter: number;
    readonly downCounter: number;
}

export interface ZigZagCheckpoint {
    readonly disabled: boolean;
    readonly previousClose: number | null;
    readonly lastExtremum: number | null;
    readonly isUpTrend: boolean | null;
    readonly shift: number;
}

export interface IchimokuCheckpoint {
    readonly tenkanHigh: RollingWindowCheckpoint;
    readonly tenkanLow: RollingWindowCheckpoint;
    readonly kijunHigh: RollingWindowCheckpoint;
    readonly kijunLow: RollingWindowCheckpoint;
    readonly senkouBHigh: RollingWindowCheckpoint;
    readonly senkouBLow: RollingWindowCheckpoint;
}

export class AlligatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    AlligatorCheckpoint
> {
    private readonly jaw: SmoothedMovingAverage;
    private readonly teeth: SmoothedMovingAverage;
    private readonly lips: SmoothedMovingAverage;

    constructor(
        readonly jawLength: number,
        readonly jawShift: number,
        readonly teethLength: number,
        readonly teethShift: number,
        readonly lipsLength: number,
        readonly lipsShift: number,
    ) {
        super(['jaw', 'teeth', 'lips']);
        period(jawLength, jawLength, 1, 200, 'jawLength');
        period(jawShift, jawShift, 0, 100, 'jawShift');
        period(teethLength, teethLength, 1, 200, 'teethLength');
        period(teethShift, teethShift, 0, 100, 'teethShift');
        period(lipsLength, lipsLength, 1, 200, 'lipsLength');
        period(lipsShift, lipsShift, 0, 100, 'lipsShift');
        this.jaw = new SmoothedMovingAverage(jawLength);
        this.teeth = new SmoothedMovingAverage(teethLength);
        this.lips = new SmoothedMovingAverage(lipsLength);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const median = high === null || low === null ? null : (high + low) / 2;
        const jaw = commit ? this.jaw.push(median) : this.jaw.preview(median);
        const teeth = commit ? this.teeth.push(median) : this.teeth.preview(median);
        const lips = commit ? this.lips.push(median) : this.lips.preview(median);
        const values: IndicatorOutputValue[] = [];
        if (input.index >= this.jawLength - 1)
            values.push(this.output('jaw', jaw, input.index + this.jawShift));
        if (input.index >= this.teethLength - 1)
            values.push(this.output('teeth', teeth, input.index + this.teethShift));
        if (input.index >= this.lipsLength - 1)
            values.push(this.output('lips', lips, input.index + this.lipsShift));
        return {
            isFormed: values.some((value) => value.value !== null),
            values,
        };
    }

    protected resetState(): void {
        this.jaw.reset();
        this.teeth.reset();
        this.lips.reset();
    }
    protected captureState(): AlligatorCheckpoint {
        return Object.freeze({
            jaw: this.jaw.checkpoint(),
            teeth: this.teeth.checkpoint(),
            lips: this.lips.checkpoint(),
        });
    }
    protected restoreState(state: AlligatorCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid Alligator checkpoint');
        this.jaw.restore(state.jaw);
        this.teeth.restore(state.teeth);
        this.lips.restore(state.lips);
    }
}

export class GatorOscillatorProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    GatorOscillatorCheckpoint
> {
    private readonly jaw: SmoothedMovingAverage;
    private readonly teeth: SmoothedMovingAverage;
    private readonly lips: SmoothedMovingAverage;
    private readonly jawDelay: RingBuffer<number | null>;
    private readonly teethDelay: RingBuffer<number | null>;
    private readonly lipsDelay: RingBuffer<number | null>;

    constructor(
        readonly jawLength: number,
        readonly jawShift: number,
        readonly teethLength: number,
        readonly teethShift: number,
        readonly lipsLength: number,
        readonly lipsShift: number,
    ) {
        super(['upper', 'lower']);
        period(jawLength, jawLength, 1, 200, 'jawLength');
        period(jawShift, jawShift, 0, 100, 'jawShift');
        period(teethLength, teethLength, 1, 200, 'teethLength');
        period(teethShift, teethShift, 0, 100, 'teethShift');
        period(lipsLength, lipsLength, 1, 200, 'lipsLength');
        period(lipsShift, lipsShift, 0, 100, 'lipsShift');
        this.jaw = new SmoothedMovingAverage(jawLength);
        this.teeth = new SmoothedMovingAverage(teethLength);
        this.lips = new SmoothedMovingAverage(lipsLength);
        this.jawDelay = new RingBuffer(jawShift + 1);
        this.teethDelay = new RingBuffer(teethShift + 1);
        this.lipsDelay = new RingBuffer(lipsShift + 1);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const median = high === null || low === null ? null : (high + low) / 2;
        const jaw = this.line(
            this.jaw,
            this.jawDelay,
            this.jawLength,
            this.jawShift,
            median,
            input.index,
            commit,
        );
        const teeth = this.line(
            this.teeth,
            this.teethDelay,
            this.teethLength,
            this.teethShift,
            median,
            input.index,
            commit,
        );
        const lips = this.line(
            this.lips,
            this.lipsDelay,
            this.lipsLength,
            this.lipsShift,
            median,
            input.index,
            commit,
        );
        const upper = jaw === null || lips === null ? null : Math.abs(jaw - lips);
        const lower = lips === null || teeth === null ? null : -Math.abs(lips - teeth);
        return {
            isFormed: upper !== null || lower !== null,
            values: [
                this.output('upper', upper, input.index),
                this.output('lower', lower, input.index),
            ],
        };
    }

    protected resetState(): void {
        this.jaw.reset();
        this.teeth.reset();
        this.lips.reset();
        this.jawDelay.clear();
        this.teethDelay.clear();
        this.lipsDelay.clear();
    }
    protected captureState(): GatorOscillatorCheckpoint {
        return Object.freeze({
            jaw: this.lineCheckpoint(this.jaw, this.jawDelay),
            teeth: this.lineCheckpoint(this.teeth, this.teethDelay),
            lips: this.lineCheckpoint(this.lips, this.lipsDelay),
        });
    }
    protected restoreState(state: GatorOscillatorCheckpoint): void {
        if (state === null || typeof state !== 'object')
            throw new TypeError('sschart: invalid Gator checkpoint');
        this.restoreLine(state.jaw, this.jaw, this.jawDelay, this.jawShift + 1);
        this.restoreLine(state.teeth, this.teeth, this.teethDelay, this.teethShift + 1);
        this.restoreLine(state.lips, this.lips, this.lipsDelay, this.lipsShift + 1);
    }

    private line(
        average: SmoothedMovingAverage,
        delay: RingBuffer<number | null>,
        length: number,
        shift: number,
        median: number | null,
        sourceIndex: number,
        commit: boolean,
    ): number | null {
        const current = commit ? average.push(median) : average.preview(median);
        const candidate = sourceIndex >= length - 1 ? current : null;
        if (commit) {
            delay.push(candidate);
            const index = delay.size - shift - 1;
            return index < 0 ? null : (delay.at(index) ?? null);
        }
        if (shift === 0) return candidate;
        const index = delay.size - shift;
        return index < 0 ? null : (delay.at(index) ?? null);
    }

    private lineCheckpoint(
        average: SmoothedMovingAverage,
        delay: RingBuffer<number | null>,
    ): GatorLineCheckpoint {
        return Object.freeze({
            average: average.checkpoint(),
            delay: delay.checkpoint(),
        });
    }

    private restoreLine(
        state: GatorLineCheckpoint,
        average: SmoothedMovingAverage,
        delay: RingBuffer<number | null>,
        capacity: number,
    ): void {
        if (state === null || typeof state !== 'object'
            || !validWindow(state.delay, capacity)) {
            throw new TypeError('sschart: invalid Gator line checkpoint');
        }
        average.restore(state.average);
        delay.restore(state.delay);
    }
}

export class IchimokuProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    IchimokuCheckpoint
> {
    private readonly tenkanHigh: RollingMaximum;
    private readonly tenkanLow: RollingMinimum;
    private readonly kijunHigh: RollingMaximum;
    private readonly kijunLow: RollingMinimum;
    private readonly senkouBHigh: RollingMaximum;
    private readonly senkouBLow: RollingMinimum;

    constructor(
        readonly tenkan: number,
        readonly kijun: number,
        readonly senkouB: number,
    ) {
        super(['tenkan', 'kijun', 'senkouA', 'senkouB', 'chikou']);
        period(tenkan, tenkan, 1, 200, 'tenkan');
        period(kijun, kijun, 1, 400, 'kijun');
        period(senkouB, senkouB, 1, 400, 'senkouB');
        this.tenkanHigh = new RollingMaximum(tenkan);
        this.tenkanLow = new RollingMinimum(tenkan);
        this.kijunHigh = new RollingMaximum(kijun);
        this.kijunLow = new RollingMinimum(kijun);
        this.senkouBHigh = new RollingMaximum(senkouB);
        this.senkouBLow = new RollingMinimum(senkouB);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const high = finite(input.value?.high);
        const low = finite(input.value?.low);
        const close = finite(input.value?.close);
        const tenkanHigh = commit ? this.tenkanHigh.push(high) : this.tenkanHigh.preview(high);
        const tenkanLow = commit ? this.tenkanLow.push(low) : this.tenkanLow.preview(low);
        const kijunHigh = commit ? this.kijunHigh.push(high) : this.kijunHigh.preview(high);
        const kijunLow = commit ? this.kijunLow.push(low) : this.kijunLow.preview(low);
        const senkouBHigh = commit
            ? this.senkouBHigh.push(high)
            : this.senkouBHigh.preview(high);
        const senkouBLow = commit
            ? this.senkouBLow.push(low)
            : this.senkouBLow.preview(low);

        const tenkan = tenkanHigh === null || tenkanLow === null
            ? null
            : (tenkanHigh + tenkanLow) / 2;
        const kijun = kijunHigh === null || kijunLow === null
            ? null
            : (kijunHigh + kijunLow) / 2;
        const spanA = tenkan === null || kijun === null ? null : (tenkan + kijun) / 2;
        const spanB = senkouBHigh === null || senkouBLow === null
            ? null
            : (senkouBHigh + senkouBLow) / 2;
        const values: IndicatorOutputValue[] = [
            this.output('tenkan', tenkan, input.index),
            this.output('kijun', kijun, input.index),
            ...this.forward('senkouA', spanA, Math.max(this.tenkan, this.kijun) - 1, input.index),
            ...this.forward('senkouB', spanB, this.senkouB - 1, input.index),
            this.output(
                'chikou',
                input.index >= this.kijun - 1 ? close : null,
                input.index,
            ),
        ];
        return {
            isFormed: values.some((value) => value.value !== null),
            values,
        };
    }

    protected resetState(): void {
        this.tenkanHigh.reset();
        this.tenkanLow.reset();
        this.kijunHigh.reset();
        this.kijunLow.reset();
        this.senkouBHigh.reset();
        this.senkouBLow.reset();
    }

    protected captureState(): IchimokuCheckpoint {
        return Object.freeze({
            tenkanHigh: this.tenkanHigh.checkpoint(),
            tenkanLow: this.tenkanLow.checkpoint(),
            kijunHigh: this.kijunHigh.checkpoint(),
            kijunLow: this.kijunLow.checkpoint(),
            senkouBHigh: this.senkouBHigh.checkpoint(),
            senkouBLow: this.senkouBLow.checkpoint(),
        });
    }

    protected restoreState(state: IchimokuCheckpoint): void {
        if (!validWindow(state?.tenkanHigh, this.tenkan)
            || !validWindow(state?.tenkanLow, this.tenkan)
            || !validWindow(state?.kijunHigh, this.kijun)
            || !validWindow(state?.kijunLow, this.kijun)
            || !validWindow(state?.senkouBHigh, this.senkouB)
            || !validWindow(state?.senkouBLow, this.senkouB)) {
            throw new TypeError('sschart: invalid Ichimoku checkpoint');
        }
        this.tenkanHigh.restore(state.tenkanHigh);
        this.tenkanLow.restore(state.tenkanLow);
        this.kijunHigh.restore(state.kijunHigh);
        this.kijunLow.restore(state.kijunLow);
        this.senkouBHigh.restore(state.senkouBHigh);
        this.senkouBLow.restore(state.senkouBLow);
    }

    private forward(
        outputId: 'senkouA' | 'senkouB',
        value: number | null,
        rawFirst: number,
        sourceIndex: number,
    ): IndicatorOutputValue[] {
        if (sourceIndex < rawFirst) return [];
        if (sourceIndex === rawFirst) {
            return [
                this.output(outputId, value, sourceIndex + this.kijun - 1),
                this.output(outputId, value, sourceIndex + this.kijun),
            ];
        }
        return [this.output(outputId, value, sourceIndex + this.kijun)];
    }
}

export class FractalsProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    FractalsCheckpoint
> {
    private readonly window: RingBuffer<FractalWindowValue>;
    private upCounter = 0;
    private downCounter = 0;

    constructor(readonly length: number) {
        super(['up', 'down']);
        if (!Number.isInteger(length) || length < 3 || length > 99 || length % 2 === 0) {
            throw new RangeError(
                'sschart: indicator length must be an odd integer from 3 to 99',
            );
        }
        this.window = new RingBuffer(length);
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const current = Object.freeze({
            high: finite(input.value?.high),
            low: finite(input.value?.low),
        });
        const window = this.window.toArray();
        if (window.length === this.length) window.shift();
        window.push(current);

        const upCounter = this.upCounter + 1;
        const downCounter = this.downCounter + 1;
        const up = upCounter >= this.length ? this.pivot(window, 'high', true) : null;
        const down = downCounter >= this.length ? this.pivot(window, 'low', false) : null;
        if (commit) {
            this.window.push(current);
            this.upCounter = up === null ? upCounter : 0;
            this.downCounter = down === null ? downCounter : 0;
        }

        const targetIndex = input.index - Math.floor(this.length / 2);
        const values: IndicatorOutputValue[] = [];
        if (up !== null) values.push(this.output('up', up, targetIndex));
        if (down !== null) values.push(this.output('down', down, targetIndex));
        return {
            isFormed: window.length === this.length,
            values,
        };
    }

    protected resetState(): void {
        this.window.clear();
        this.upCounter = 0;
        this.downCounter = 0;
    }

    protected captureState(): FractalsCheckpoint {
        return Object.freeze({
            window: this.window.checkpoint(),
            upCounter: this.upCounter,
            downCounter: this.downCounter,
        });
    }

    protected restoreState(state: FractalsCheckpoint): void {
        const values = state?.window?.values;
        if (!Array.isArray(values) || values.length > this.length
            || values.some((item) => item === null || typeof item !== 'object'
                || (item.high !== null && finite(item.high) === null)
                || (item.low !== null && finite(item.low) === null))
            || !Number.isInteger(state.upCounter) || state.upCounter < 0
            || !Number.isInteger(state.downCounter) || state.downCounter < 0) {
            throw new TypeError('sschart: invalid Fractals checkpoint');
        }
        this.window.restore({
            values: Object.freeze(values.map((item) => Object.freeze({ ...item }))),
        });
        this.upCounter = state.upCounter;
        this.downCounter = state.downCounter;
    }

    private pivot(
        values: readonly FractalWindowValue[],
        field: 'high' | 'low',
        upward: boolean,
    ): number | null {
        if (values.length !== this.length) return null;
        const middle = Math.floor(this.length / 2);
        for (let index = 0; index < this.length - 1; index += 1) {
            const left = values[index][field];
            const right = values[index + 1][field];
            if (left === null || right === null) return null;
            const rising = upward ? left < right : left > right;
            const falling = upward ? left > right : left < right;
            if (index < middle ? !rising : !falling) return null;
        }
        return values[middle][field];
    }
}

type ZigZagSource = 'close' | 'high' | 'low';
type ZigZagDirection = 'both' | 'up' | 'down';

class ZigZagFamilyProcessor extends SequentialIndicatorProcessor<
    IndicatorCandle,
    ZigZagCheckpoint
> {
    private disabled = false;
    private previousPrice: number | null = null;
    private lastExtremum: number | null = null;
    private isUpTrend: boolean | null = null;
    private shift = 0;

    constructor(
        readonly deviation: number,
        private readonly source: ZigZagSource,
        private readonly direction: ZigZagDirection,
    ) {
        super(['value']);
        if (!(deviation > 0 && deviation < 1) || !Number.isFinite(deviation))
            throw new RangeError('sschart: indicator deviation must be finite between 0 and 1');
    }

    protected calculate(
        input: IndicatorProcessInput<IndicatorCandle>,
        commit: boolean,
    ): IndicatorCalculationResult {
        const price = finite(input.value?.[this.source]);
        if (input.index === 0) {
            if (commit) {
                this.disabled = price === null;
                this.previousPrice = price;
            }
            return { isFormed: false, values: [] };
        }
        if (this.disabled || price === null || this.previousPrice === null) {
            if (commit) this.previousPrice = price;
            return { isFormed: false, values: [] };
        }

        if (this.lastExtremum === null || this.isUpTrend === null) {
            if (commit) {
                this.lastExtremum = price;
                this.isUpTrend = price >= this.previousPrice;
                this.previousPrice = price;
            }
            return { isFormed: true, values: [] };
        }

        let lastExtremum = this.lastExtremum;
        let isUpTrend = this.isUpTrend;
        let shift = this.shift;
        let changed = false;
        const threshold = lastExtremum * this.deviation;
        if (isUpTrend) {
            if (lastExtremum < price) lastExtremum = price;
            else if (price <= lastExtremum - threshold) changed = true;
        } else {
            if (lastExtremum > price) lastExtremum = price;
            else if (price >= lastExtremum + threshold) changed = true;
        }

        const accepted = changed && (this.direction === 'both'
            || (this.direction === 'up' && isUpTrend)
            || (this.direction === 'down' && !isUpTrend));
        const values = accepted
            ? [this.output('value', lastExtremum, input.index - shift)]
            : [];
        if (changed) {
            isUpTrend = !isUpTrend;
            lastExtremum = price;
            shift = 1;
        } else shift += 1;
        if (commit) {
            this.previousPrice = price;
            this.lastExtremum = lastExtremum;
            this.isUpTrend = isUpTrend;
            this.shift = shift;
        }
        return { isFormed: true, values };
    }

    protected resetState(): void {
        this.disabled = false;
        this.previousPrice = null;
        this.lastExtremum = null;
        this.isUpTrend = null;
        this.shift = 0;
    }

    protected captureState(): ZigZagCheckpoint {
        return Object.freeze({
            disabled: this.disabled,
            previousClose: this.previousPrice,
            lastExtremum: this.lastExtremum,
            isUpTrend: this.isUpTrend,
            shift: this.shift,
        });
    }

    protected restoreState(state: ZigZagCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || typeof state.disabled !== 'boolean'
            || (state.previousClose !== null && finite(state.previousClose) === null)
            || (state.lastExtremum !== null && finite(state.lastExtremum) === null)
            || (state.isUpTrend !== null && typeof state.isUpTrend !== 'boolean')
            || (state.lastExtremum === null) !== (state.isUpTrend === null)
            || !Number.isInteger(state.shift) || state.shift < 0) {
            throw new TypeError('sschart: invalid ZigZag checkpoint');
        }
        this.disabled = state.disabled;
        this.previousPrice = state.previousClose;
        this.lastExtremum = state.lastExtremum;
        this.isUpTrend = state.isUpTrend;
        this.shift = state.shift;
    }
}

export class ZigZagProcessor extends ZigZagFamilyProcessor {
    constructor(deviation: number) { super(deviation, 'close', 'both'); }
}

export class PeakProcessor extends ZigZagFamilyProcessor {
    constructor(deviation: number) { super(deviation, 'high', 'up'); }
}

export class TroughProcessor extends ZigZagFamilyProcessor {
    constructor(deviation: number) { super(deviation, 'low', 'down'); }
}

function zigZagDeviation(value: unknown): number {
    const resolved = value ?? 0.05;
    if (typeof resolved !== 'number' || !Number.isFinite(resolved))
        throw new RangeError('sschart: indicator deviation must be finite between 0 and 1');
    // Catalog versions before the ratio fix persisted whole percentages.
    const ratio = resolved >= 1 && resolved <= 50 ? resolved / 100 : resolved;
    if (!(ratio > 0 && ratio < 1))
        throw new RangeError('sschart: indicator deviation must be finite between 0 and 1');
    return ratio;
}

function strictDeviation(value: unknown): number {
    const resolved = value ?? 0.001;
    if (typeof resolved !== 'number' || !Number.isFinite(resolved)
        || !(resolved > 0 && resolved < 1)) {
        throw new RangeError('sschart: indicator deviation must be finite between 0 and 1');
    }
    return resolved;
}

export const IchimokuIndicator: IndicatorDefinition<
    IndicatorCandle,
    IchimokuParameters
> = registerIndicator({
    id: 'Ichimoku',
    name: 'Ichimoku',
    description: 'Ichimoku cloud with rolling high-low midpoints and forward Senkou spans.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [
        lengthParameter('tenkan', 'Tenkan', 9, 200),
        lengthParameter('kijun', 'Kijun', 26, 400),
        lengthParameter('senkouB', 'Senkou B', 52, 400),
    ],
    outputs: [
        { id: 'tenkan', name: 'Tenkan', defaultStyle: lineStyle('#FF6347') },
        { id: 'kijun', name: 'Kijun', defaultStyle: lineStyle('#1E90FF') },
        {
            id: 'senkouA',
            name: 'Senkou A',
            defaultStyle: {
                series: IndicatorSeriesStyle.Band,
                color: '#32CD32',
                options: { priceLineVisible: false },
            },
        },
        {
            id: 'senkouB',
            name: 'Senkou B',
            defaultStyle: {
                series: IndicatorSeriesStyle.Band,
                color: '#FF1493',
                options: { priceLineVisible: false },
            },
        },
        {
            id: 'chikou',
            name: 'Chikou',
            defaultStyle: lineStyle('#EE82EE', { lineStyle: 2 }),
        },
    ],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new IchimokuProcessor(
        parameter(parameters, 'tenkan', 'tenkanPeriod', 9, 200),
        parameter(parameters, 'kijun', 'kijunPeriod', 26, 400),
        parameter(parameters, 'senkouB', 'senkouBPeriod', 52, 400),
    ),
});

export const AlligatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    AlligatorParameters
> = registerIndicator({
    id: 'Alligator',
    name: 'Alligator',
    description: 'Bill Williams median-price SMMA lines with independent forward shifts.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: alligatorParameterSchema(),
    outputs: [
        { id: 'jaw', name: 'Jaw', defaultStyle: lineStyle('#1E90FF') },
        { id: 'teeth', name: 'Teeth', defaultStyle: lineStyle('#FF0000') },
        { id: 'lips', name: 'Lips', defaultStyle: lineStyle('#32CD32') },
    ],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory: (parameters) => new AlligatorProcessor(
        period(parameters?.jawLength, 13, 1, 200, 'jawLength'),
        period(parameters?.jawShift, 8, 0, 100, 'jawShift'),
        period(parameters?.teethLength, 8, 1, 200, 'teethLength'),
        period(parameters?.teethShift, 5, 0, 100, 'teethShift'),
        period(parameters?.lipsLength, 5, 1, 200, 'lipsLength'),
        period(parameters?.lipsShift, 3, 0, 100, 'lipsShift'),
    ),
});

export const GatorOscillatorIndicator: IndicatorDefinition<
    IndicatorCandle,
    AlligatorParameters
> = registerIndicator({
    id: 'GatorOscillator',
    name: 'Gator Oscillator',
    description: 'Aligned distances between the independently shifted Alligator lines.',
    category: IndicatorCategory.Momentum,
    input: CandlestickIndicatorInput,
    parameters: alligatorParameterSchema(),
    outputs: [
        {
            id: 'upper',
            name: 'Upper',
            defaultStyle: {
                series: IndicatorSeriesStyle.Histogram,
                color: '#00c853',
                options: { priceLineVisible: false },
            },
        },
        {
            id: 'lower',
            name: 'Lower',
            defaultStyle: {
                series: IndicatorSeriesStyle.Histogram,
                color: '#ff3d57',
                options: { priceLineVisible: false },
            },
        },
    ],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
    processorFactory: (parameters) => new GatorOscillatorProcessor(
        period(parameters?.jawLength, 13, 1, 200, 'jawLength'),
        period(parameters?.jawShift, 8, 0, 100, 'jawShift'),
        period(parameters?.teethLength, 8, 1, 200, 'teethLength'),
        period(parameters?.teethShift, 5, 0, 100, 'teethShift'),
        period(parameters?.lipsLength, 5, 1, 200, 'lipsLength'),
        period(parameters?.lipsShift, 3, 0, 100, 'lipsShift'),
    ),
});

export const FractalsIndicator: IndicatorDefinition<
    IndicatorCandle,
    FractalsParameters
> = registerIndicator({
        id: 'Fractals',
        name: 'Fractals',
        description: 'Bill Williams fractal pivots placed on their confirmed center candles.',
        category: IndicatorCategory.SupportResistance,
        input: CandlestickIndicatorInput,
        parameters: [{
            id: 'length',
            name: 'Length',
            type: IndicatorParameterType.Integer,
            defaultValue: 5,
            min: 3,
            max: 99,
            step: 2,
        }],
        outputs: [
            {
                id: 'up',
                name: 'Up',
                defaultStyle: {
                    series: IndicatorSeriesStyle.Markers,
                    color: '#32CD32',
                    options: { pointMarkersRadius: 4 },
                },
            },
            {
                id: 'down',
                name: 'Down',
                defaultStyle: {
                    series: IndicatorSeriesStyle.Markers,
                    color: '#FF3D57',
                    options: { pointMarkersRadius: 4 },
                },
            },
        ],
        naturalPane: IndicatorPane.Overlay,
        measure: IndicatorMeasure.Price,
        processorFactory: (parameters) => new FractalsProcessor(
            period(parameters?.length, 5, 3, 99, 'length'),
        ),
    });

export const ZigZagIndicator: IndicatorDefinition<
    IndicatorCandle,
    ZigZagParameters
> = registerIndicator({
        id: 'ZigZag',
        name: 'ZigZag',
        description: 'Close-price reversal pivots placed on their shifted extremum candles.',
        category: IndicatorCategory.SupportResistance,
        input: CandlestickIndicatorInput,
        parameters: [{
            id: 'deviation',
            name: 'Deviation',
            type: IndicatorParameterType.Number,
            defaultValue: 0.05,
            min: 0.001,
            max: 0.5,
            step: 0.001,
        }],
        outputs: [{
            id: 'value',
            name: 'ZigZag',
            defaultStyle: {
                series: IndicatorSeriesStyle.Markers,
                color: '#FFD54F',
                options: { pointMarkersRadius: 4 },
            },
        }],
        naturalPane: IndicatorPane.Overlay,
        measure: IndicatorMeasure.Price,
        processorFactory: (parameters) => new ZigZagProcessor(
            zigZagDeviation(parameters?.deviation),
        ),
    });

export const PeakIndicator: IndicatorDefinition<IndicatorCandle, ZigZagParameters>
    = registerIndicator({
        id: 'Peak',
        name: 'Peak',
        description: 'ZigZag up-pivots calculated from candle high prices.',
        category: IndicatorCategory.SupportResistance,
        input: CandlestickIndicatorInput,
        parameters: [{
            id: 'deviation',
            name: 'Deviation',
            type: IndicatorParameterType.Number,
            defaultValue: 0.001,
            min: 0.001,
            max: 0.999,
            step: 0.001,
        }],
        outputs: [{ id: 'value', name: 'Peak', defaultStyle: lineStyle('#32CD32') }],
        naturalPane: IndicatorPane.Overlay,
        measure: IndicatorMeasure.Price,
        processorFactory: (parameters) => new PeakProcessor(
            strictDeviation(parameters?.deviation),
        ),
    });

export const TroughIndicator: IndicatorDefinition<IndicatorCandle, ZigZagParameters>
    = registerIndicator({
        id: 'Trough',
        name: 'Trough',
        description: 'ZigZag down-pivots calculated from candle low prices.',
        category: IndicatorCategory.SupportResistance,
        input: CandlestickIndicatorInput,
        parameters: [{
            id: 'deviation',
            name: 'Deviation',
            type: IndicatorParameterType.Number,
            defaultValue: 0.001,
            min: 0.001,
            max: 0.999,
            step: 0.001,
        }],
        outputs: [{ id: 'value', name: 'Trough', defaultStyle: lineStyle('#FF3D57') }],
        naturalPane: IndicatorPane.Overlay,
        measure: IndicatorMeasure.Price,
        processorFactory: (parameters) => new TroughProcessor(
            strictDeviation(parameters?.deviation),
        ),
    });

export const ShiftedSparseIndicators = Object.freeze([
    IchimokuIndicator,
    AlligatorIndicator,
    GatorOscillatorIndicator,
    FractalsIndicator,
    ZigZagIndicator,
    PeakIndicator,
    TroughIndicator,
] as const);
