import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchRocketInstruments, isRocketLinear } from "../helpers/rocket";

/*
 * Open interest for Rocket's linear derivatives (perps & dated futures).
 * Options OI is reported separately by open-interest/rocket-options.ts.
 */
async function fetch() {
    const { instruments, instrumentStats } = await fetchRocketInstruments();

    let openInterestAtEnd = 0;
    for (const [id, stats] of Object.entries(instrumentStats)) {
        const inst = instruments[id];
        if (!inst) {
            console.log(`Rocket OI: stats returned for unknown instrument ${id}, skipping`);
            continue;
        }
        // Only linear derivatives are counted; options are excluded
        // (their lastMatchPrice is the premium, not a notional price)
        if (!isRocketLinear(inst.instrumentType)) continue;
        const price = Number(inst.lastMatchPrice);
        const oi = Number(stats.openInterest ?? 0);
        if (!Number.isFinite(price) || !Number.isFinite(oi)) {
            throw new Error(`Rocket OI: invalid data for ${inst.ticker}: openInterest=${stats.openInterest} lastMatchPrice=${inst.lastMatchPrice}`);
        }
        openInterestAtEnd += oi * price;
    }

    return { openInterestAtEnd };
}

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
