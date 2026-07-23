import type { Time, TimeRange } from '../core/chart-api.js';
import type {
    ITradingCalendar,
    TradingSession,
    TradingSessionKind,
} from './trading-calendar.js';

interface ProjectedSession {
    readonly session: TradingSession;
    readonly from: number;
    readonly to: number;
}

/**
 * Immutable piecewise-linear projection that preserves elapsed time inside
 * selected sessions and assigns zero width to every closed-market gap.
 */
export class SessionTimeProjection {
    private readonly projected: readonly ProjectedSession[];
    readonly sessions: readonly TradingSession[];
    readonly totalTradingSeconds: number;

    constructor(
        calendar: ITradingCalendar,
        range: TimeRange,
        kinds?: readonly TradingSessionKind[],
    ) {
        this.sessions = calendar.sessionsInRange(range, kinds);
        let elapsed = 0;
        this.projected = Object.freeze(this.sessions.map((session) => {
            const from = elapsed;
            elapsed += session.closeTime - session.openTime;
            return Object.freeze({ session, from, to: elapsed });
        }));
        this.totalTradingSeconds = elapsed;
    }

    get hasSessions(): boolean {
        return this.projected.length > 0;
    }

    /** Maps UTC time to elapsed open-session seconds; closed gaps collapse. */
    timeToTradingTime(time: Time): number | null {
        if (!Number.isFinite(time) || this.projected.length === 0) return null;
        if (time <= this.projected[0].session.openTime) return 0;

        let low = 0;
        let high = this.projected.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this.projected[middle].session.openTime <= time) low = middle + 1;
            else high = middle;
        }
        const segment = this.projected[Math.max(0, low - 1)];
        if (time < segment.session.closeTime)
            return segment.from + time - segment.session.openTime;
        return segment.to;
    }

    /**
     * Inverse projection. At a collapsed gap boundary the next session open is
     * selected, so moving left-to-right never jumps backwards in UTC.
     */
    tradingTimeToTime(value: number): Time | null {
        if (!Number.isFinite(value) || this.projected.length === 0) return null;
        if (value <= 0) return this.projected[0].session.openTime;
        if (value >= this.totalTradingSeconds)
            return this.projected[this.projected.length - 1].session.closeTime;

        let low = 0;
        let high = this.projected.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this.projected[middle].to < value) low = middle + 1;
            else high = middle;
        }
        const segment = this.projected[low];
        if (value === segment.to && low + 1 < this.projected.length)
            return this.projected[low + 1].session.openTime;
        return segment.session.openTime + value - segment.from;
    }
}
