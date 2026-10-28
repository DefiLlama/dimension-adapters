/*
 * Shared helpers for the Rocket adapters (dexs/rocket, options/rocket, open-interest/rocket-*).
 *
 * Rocket public API: https://beta.rocket-cluster-1.com (docs: https://api.docs.rocketfi.io/)
 *
 * GET /instruments is paginated: `pageNumber` is 0-based and `pageSize` is capped at 1000 by the
 * server. Calling it without params silently returns only the first 1000 instruments, so every
 * consumer must walk all pages (there are ~1.8k trading instruments once options are included).
 */

import fetchURL from "../utils/fetchURL";

export const ROCKET_API = "https://beta.rocket-cluster-1.com";

// Wire type is a string; known values are PERP, FUTURE, CALL_OPTION, PUT_OPTION (spot may be added)
export interface RocketInstrument {
    id: string;
    ticker: string;
    instrumentType: string;
    underlyingAsset: string;
    settlementAsset: string;
    isTrading: boolean;
    lastMatchPrice: string;
}

export interface RocketInstrumentStats {
    openInterest: number;
    volume24h: string;
    quoteVolume24h: string;
}

export interface RocketInstrumentsResponse {
    instruments: Record<string, RocketInstrument>;
    instrumentStats: Record<string, RocketInstrumentStats>;
}

/** True for option instruments (instrumentType CALL_OPTION or PUT_OPTION). */
export const isRocketOption = (t: string) => t === "CALL_OPTION" || t === "PUT_OPTION";

/** True for linear derivatives (instrumentType PERP or FUTURE), i.e. everything that is not an option. */
export const isRocketLinear = (t: string) => t === "PERP" || t === "FUTURE";

const PAGE_SIZE = 1000; // server-side maximum
const MAX_PAGES = 50;   // safety stop (~50k instruments); one extra terminating page is allowed

/**
 * Fetch every page of GET /instruments and merge them.
 * Fails closed: throws on a malformed page (missing `instruments` or `instrumentStats`) or if the
 * endpoint keeps returning full pages beyond MAX_PAGES, so a partial snapshot is never returned.
 */
export async function fetchRocketInstruments(): Promise<RocketInstrumentsResponse> {
    const instruments: Record<string, RocketInstrument> = {};
    const instrumentStats: Record<string, RocketInstrumentStats> = {};
    for (let page = 0; page <= MAX_PAGES; page++) {
        const res: RocketInstrumentsResponse = await fetchURL(`${ROCKET_API}/instruments?pageNumber=${page}&pageSize=${PAGE_SIZE}`);
        if (!res || typeof res.instruments !== "object" || typeof res.instrumentStats !== "object") {
            throw new Error(`Rocket: malformed /instruments response on page ${page}`);
        }
        Object.assign(instruments, res.instruments);
        Object.assign(instrumentStats, res.instrumentStats);
        if (Object.keys(res.instruments).length < PAGE_SIZE) return { instruments, instrumentStats };
    }
    throw new Error(`Rocket: /instruments did not terminate after ${MAX_PAGES} full pages`);
}

/** Underlying asset -> last match price of its perp market, used to value options in USD. */
export function rocketUnderlyingPrices(instruments: Record<string, RocketInstrument>): Record<string, number> {
    const prices: Record<string, number> = {};
    for (const inst of Object.values(instruments)) {
        if (inst.instrumentType === "PERP") prices[inst.underlyingAsset] = Number(inst.lastMatchPrice);
    }
    return prices;
}

/**
 * Parse a non-negative numeric field from the API. Throws (fail closed) when the value is
 * missing, blank, non-numeric or negative, so bad upstream data never becomes a silent 0.
 */
export function rocketNonNegative(value: unknown, what: string): number {
    if (value === undefined || value === null || String(value).trim() === "") throw new Error(`Rocket: missing ${what}`);
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Rocket: invalid ${what}: ${JSON.stringify(value)}`);
    return n;
}
