const OA_EPOCH_MS = Date.UTC(1899, 11, 30);
const MILLISECONDS_PER_DAY = 86_400_000;
const JULIAN_OA_OFFSET = 2_415_018.5;
const REFERENCE_JULIAN_DATE = 2_451_549.5;
const SYNODIC_MONTH_DAYS = 29.53;
const PHASE_COUNT = 8;

/**
 * Mirrors Ecng.Common.TimeHelper.GetLunarPhase and returns its phase index 0..7.
 */
export function lunarPhaseFromMilliseconds(timestamp: number): number | null {
    if (!Number.isFinite(timestamp)) return null;
    const oleAutomationDate = (timestamp - OA_EPOCH_MS) / MILLISECONDS_PER_DAY;
    const julianDate = oleAutomationDate + JULIAN_OA_OFFSET;
    const cycles = (julianDate - REFERENCE_JULIAN_DATE) / SYNODIC_MONTH_DAYS;
    const phase = cycles - Math.floor(cycles);
    return Math.floor(phase * PHASE_COUNT);
}
