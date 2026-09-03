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
import { fetchRocketInstruments, isRocketOption, rocketNonNegative, rocketUnderlyingPrices } from "../helpers/rocket";

const fetch = async (options: FetchOptions) => {
    const { instruments, instrumentStats } = await fetchRocketInstruments();
    const underlyingPrice = rocketUnderlyingPrices(instruments);

    // Fail closed on inconsistent upstream data rather than publishing a partial snapshot
    for (const id of Object.keys(instrumentStats)) {
        if (!instruments[id]) throw new Error(`Rocket options OI: stats returned for unknown instrument ${id}`);
    }

    const openInterestAtEnd = options.createBalances();
    for (const [id, inst] of Object.entries(instruments)) {
        if (!isRocketOption(inst.instrumentType)) continue;
        const stats = instrumentStats[id];
        if (!stats) throw new Error(`Rocket options OI: no stats for option ${inst.ticker}`);
        const oi = rocketNonNegative(stats.openInterest, `openInterest for ${inst.ticker}`);
        if (oi === 0) continue;
        const price = underlyingPrice[inst.underlyingAsset];
        if (!price) throw new Error(`Rocket options OI: no perp price for underlying ${inst.underlyingAsset} (${inst.ticker})`);
        openInterestAtEnd.addUSDValue(oi * price, "Options open interest");
    }

    return { openInterestAtEnd };
};

const methodology = {
    OpenInterest: "Sum of outstanding option contracts across all listed option underlyings on Rocket (currently BTC and ETH; GET /instruments, all pages), valued at the underlying's perpetual market last match price (one side, consistent with Rocket's perp OI adapter).",
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
