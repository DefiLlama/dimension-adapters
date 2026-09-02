/*
 * Open interest for options traded on Rocket (companion to options/rocket, which reports
 * notional & premium volume). Mirrors open-interest/derive-options.ts: options OI is reported
 * as a separate open-interest adapter rather than inside the options adapter.
 *
 * Data source:
 *   GET /instruments - per-instrument stats; openInterest on option instruments is in contracts
 *                      (1 contract = 1 unit of underlying), valued at the underlying perp's
 *                      last match price.
 *
 * Website: https://rocketfi.io
 * API Docs: https://api.docs.rocketfi.io/
 */

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

const ROCKET_API_URL = 'https://beta.rocket-cluster-1.com';

type InstrumentType = "PERP" | "FUTURE" | "CALL_OPTION" | "PUT_OPTION";

interface Instrument {
    id: string;
    ticker: string;
    instrumentType: InstrumentType;
    underlyingAsset: string;
    lastMatchPrice: string;
}

interface InstrumentStats {
    openInterest: number;
}

interface InstrumentsResponse {
    instruments: Record<string, Instrument>;
    instrumentStats: Record<string, InstrumentStats>;
}

const isOption = (t: InstrumentType) => t === "CALL_OPTION" || t === "PUT_OPTION";

async function fetch(options: FetchOptions) {
    const { instruments, instrumentStats }: InstrumentsResponse = await fetchURL(`${ROCKET_API_URL}/instruments`);

    // Underlying valued at the corresponding perp market's last match price
    const underlyingPrice: Record<string, number> = {};
    for (const inst of Object.values(instruments)) {
        if (inst.instrumentType === "PERP") underlyingPrice[inst.underlyingAsset] = Number(inst.lastMatchPrice);
    }

    const openInterestAtEnd = options.createBalances();
    for (const [id, stats] of Object.entries(instrumentStats)) {
        const inst = instruments[id];
        if (!inst) {
            console.log(`Rocket options OI: stats returned for unknown instrument ${id}, skipping`);
            continue;
        }
        if (!isOption(inst.instrumentType)) continue;
        const price = underlyingPrice[inst.underlyingAsset];
        if (!price) {
            console.log(`Rocket options OI: no perp price for underlying ${inst.underlyingAsset} (${inst.ticker}), skipping`);
            continue;
        }
        openInterestAtEnd.addUSDValue(Number(stats.openInterest ?? 0) * price, "Options open interest");
    }

    return { openInterestAtEnd };
}

const methodology = {
    OpenInterest: "Sum of outstanding option contracts across all listed BTC and ETH options, valued at the underlying's perpetual market last match price (one side, consistent with Rocket's perp OI adapter).",
};

const breakdownMethodology = {
    OpenInterest: {
        "Options open interest": "Open option contracts x underlying perp last match price.",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    runAtCurrTime: true,
    // Rocket exposes a live snapshot only, so hourly slices cannot be reconstructed.
    pullHourly: false,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    start: '2026-08-31',
    methodology,
    breakdownMethodology,
};

export default adapter;
