/*
 * Open interest for options traded on Rocket (companion to options/rocket, which reports
 * notional & premium volume). Mirrors open-interest/derive-options.ts: options OI is reported
 * as a separate open-interest adapter rather than inside the options adapter.
 *
 * Data source:
 *   GET /instruments (all pages) - per-instrument stats; openInterest on option instruments is in
 *                                  contracts (1 contract = 1 unit of underlying), valued at the
 *                                  underlying perp's last match price.
 *
 * Website: https://rocketfi.io
 * API Docs: https://api.docs.rocketfi.io/
 */

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchRocketInstruments, isRocketOption, rocketUnderlyingPrices } from "../helpers/rocket";

async function fetch(options: FetchOptions) {
    const { instruments, instrumentStats } = await fetchRocketInstruments();
    const underlyingPrice = rocketUnderlyingPrices(instruments);

    const openInterestAtEnd = options.createBalances();
    for (const [id, stats] of Object.entries(instrumentStats)) {
        const inst = instruments[id];
        if (!inst) {
            console.log(`Rocket options OI: stats returned for unknown instrument ${id}, skipping`);
            continue;
        }
        if (!isRocketOption(inst.instrumentType)) continue;
        const oi = Number(stats.openInterest ?? 0);
        if (!Number.isFinite(oi)) throw new Error(`Rocket options OI: invalid openInterest for ${inst.ticker}: ${stats.openInterest}`);
        if (oi === 0) continue;
        const price = underlyingPrice[inst.underlyingAsset];
        // Fail closed: a missing underlying price would silently under-count the snapshot
        if (!price) throw new Error(`Rocket options OI: no perp price for underlying ${inst.underlyingAsset} (${inst.ticker})`);
        openInterestAtEnd.addUSDValue(oi * price, "Options open interest");
    }

    return { openInterestAtEnd };
}

const methodology = {
    OpenInterest: "Sum of outstanding option contracts across all listed BTC and ETH options (GET /instruments, all pages), valued at the underlying's perpetual market last match price (one side, consistent with Rocket's perp OI adapter).",
};

const breakdownMethodology = {
    OpenInterest: {
        "Options open interest": "Open option contracts x underlying perp last match price.",
    },
};

const adapter: SimpleAdapter = {
    // version 1: the API only exposes a live snapshot (no historical time ranges)
    version: 1,
    runAtCurrTime: true,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    start: '2026-08-31',
    methodology,
    breakdownMethodology,
};

export default adapter;
