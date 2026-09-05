import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchRocketInstruments, isRocketLinear, rocketNonNegative } from "../helpers/rocket";

/*
 * Open interest for Rocket's linear derivatives (perps & dated futures).
 * Options OI is reported separately by open-interest/rocket-options.ts.
 */
const fetch = async (_options: FetchOptions) => {
    const { instruments, instrumentStats } = await fetchRocketInstruments();

    // Fail closed on inconsistent upstream data rather than publishing a partial snapshot
    for (const id of Object.keys(instrumentStats)) {
        if (!instruments[id]) throw new Error(`Rocket OI: stats returned for unknown instrument ${id}`);
    }

    let openInterestAtEnd = 0;
    for (const [id, inst] of Object.entries(instruments)) {
        // Only linear derivatives are counted; options are excluded
        // (their lastMatchPrice is the premium, not a notional price)
        if (!isRocketLinear(inst.instrumentType)) continue;
        const stats = instrumentStats[id];
        if (!stats) throw new Error(`Rocket OI: no stats for ${inst.ticker}`);
        const oi = rocketNonNegative(stats.openInterest, `openInterest for ${inst.ticker}`);
        const price = rocketNonNegative(inst.lastMatchPrice, `lastMatchPrice for ${inst.ticker}`);
        openInterestAtEnd += oi * price;
    }

    return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
    // version 1: the API only exposes a live snapshot (no historical time ranges)
    version: 1,
    runAtCurrTime: true,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    methodology: {
        OpenInterest: "Sum of open perpetual and dated-futures contracts on Rocket multiplied by each market's last match price (one side), from GET /instruments (all pages).",
    },
};

export default adapter;
