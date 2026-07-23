import {
    TradingCalendar,
    BarClockState,
    calculateBarCountdown,
    resolveTradingBarBounds,
    SessionShading,
    TradingSessionKind,
    TimeScaleMode,
    type ChartOptions,
    type BarCountdown,
    type TradingBarBounds,
    type ITradingCalendar,
    type SymbolInfo,
    type TradingSchedule,
    type TradingSession,
    type TradingSessionKind as TradingSessionKindValue,
} from '../../src/index.js';

const schedule: TradingSchedule = {
    id: 'xnys',
    timeZone: 'America/New_York',
    sessions: [{
        id: 'regular',
        kind: TradingSessionKind.Regular,
        weekdays: [1, 2, 3, 4, 5],
        open: { hour: 9, minute: 30 },
        close: { hour: 16, minute: 0 },
        closeDayOffset: 0,
    }],
    holidays: ['2026-12-25'],
    overrides: [{
        date: '2026-11-27',
        sessions: [{
            id: 'regular',
            kind: TradingSessionKind.Regular,
            open: { hour: 9, minute: 30 },
            close: { hour: 13, minute: 0 },
        }],
    }],
};

const symbol: SymbolInfo = { id: 'AAPL', tradingSchedule: schedule };
void symbol;

const concreteCalendar: ITradingCalendar = new TradingCalendar(schedule);
void concreteCalendar;

const sessionAwareOptions: ChartOptions = {
    timeScale: {
        mode: TimeScaleMode.SessionAware,
        calendar: concreteCalendar,
        sessionKinds: [TradingSessionKind.Regular],
        locale: 'ru-RU',
        timeZone: 'Europe/Moscow',
        formatter: (time, context) => `${context.kind}:${context.timeZone}:${time}`,
    },
};
void sessionAwareOptions;

const shading = new SessionShading({
    calendar: concreteCalendar,
    styles: {
        [TradingSessionKind.PreMarket]: { color: 'rgba(0, 0, 255, 0.08)' },
        [TradingSessionKind.PostMarket]: { visible: false },
    },
});
shading.applyOptions({ styles: { regular: { color: '#123456' } } });
const shadedSessions: readonly TradingSession[] = shading.visibleSessions();
void shadedSessions;

const barBounds: TradingBarBounds | null = resolveTradingBarBounds(
    1_800_000_000,
    '5m',
    { calendar: concreteCalendar, sessionKinds: [TradingSessionKind.Regular] },
);
const countdown: BarCountdown | null = calculateBarCountdown(
    1_800_000_000,
    '5m',
    1_800_000_120,
    { calendar: concreteCalendar },
);
const isOpen: boolean = countdown?.state === BarClockState.Open;
void barBounds;
void countdown;
void isOpen;

declare const calendar: ITradingCalendar;
const session: TradingSession | null = calendar.sessionAt(1_800_000_000, [TradingSessionKind.Regular]);
const kind: TradingSessionKindValue | undefined = session?.kind;
const sessions: readonly TradingSession[] = calendar.sessionsInRange({
    from: 1_800_000_000,
    to: 1_800_086_400,
});
const open: boolean = calendar.isTradingTime(1_800_000_000);
void kind;
void sessions;
void open;

const invalidWeekday: TradingSchedule = {
    timeZone: 'UTC',
    sessions: [{
        id: 'bad',
        kind: TradingSessionKind.Regular,
        // @ts-expect-error weekdays use ISO 1..7 values
        weekdays: [0],
        open: { hour: 0, minute: 0 },
        close: { hour: 1, minute: 0 },
    }],
};
void invalidWeekday;
