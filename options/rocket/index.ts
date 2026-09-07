/*
 * DeFiLlama Options Adapter for Rocket
 *
 * Tracks daily notional volume and premium volume for options traded on
 * Rocket - a high-performance L1 blockchain for trading derivatives.
 *
 * Data sources:
 *   GET /indexer/options-volume-24h - rolling 24h notional options volume per underlying (BTC, ETH),
 *                                     Rocket's own aggregate (same figure shown in the Rocket UI)
 *   GET /instruments (all pages)    - per-instrument rolling 24h stats; quoteVolume24h on option
 *                                     instruments is the USDC premium traded
 *
 * Website: https://rocketfi.io
 * API Docs: https://api.docs.rocketfi.io/
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { ROCKET_API, fetchRocketInstruments, isRocketOption, rocketNonNegative } from "../../helpers/rocket";

interface OptionsVolumeResponse {
    volumes: { underlyingAsset: string; notionalVolume24hr: string }[];
}

const fetch = async (options: FetchOptions) => {
    const dailyNotionalVolume = options.createBalances();
    const dailyPremiumVolume = options.createBalances();

    // Notional volume: Rocket's aggregate per underlying (already priced in USD)
    const { volumes }: OptionsVolumeResponse = await fetchURL(`${ROCKET_API}/indexer/options-volume-24h`);
    for (const { underlyingAsset, notionalVolume24hr } of volumes) {
        const notional = Number(notionalVolume24hr);
        if (!Number.isFinite(notional)) throw new Error(`Rocket options: invalid notionalVolume24hr for ${underlyingAsset}: ${notionalVolume24hr}`);
        dailyNotionalVolume.addUSDValue(notional, "Options notional");
    }

    // Premium volume: USDC quote volume across option instruments (no dedicated endpoint yet)
    const { instruments, instrumentStats } = await fetchRocketInstruments();
    // Fail closed on inconsistent upstream data rather than publishing a partial figure
    for (const id of Object.keys(instrumentStats)) {
        if (!instruments[id]) throw new Error(`Rocket options: stats returned for unknown instrument ${id}`);
    }
    for (const [id, inst] of Object.entries(instruments)) {
        if (!isRocketOption(inst.instrumentType)) continue;
        const stats = instrumentStats[id];
        if (!stats) throw new Error(`Rocket options: no stats for option ${inst.ticker}`);
        const premium = rocketNonNegative(stats.quoteVolume24h, `quoteVolume24h for ${inst.ticker}`);
        dailyPremiumVolume.addUSDValue(premium, "Options premiums");
    }

    return { dailyNotionalVolume, dailyPremiumVolume };
};

const methodology = {
    NotionalVolume: "Rolling 24h notional volume (contracts traded x underlying value) across all listed option underlyings on Rocket, currently BTC and ETH, as reported by Rocket's indexer (GET /indexer/options-volume-24h).",
    PremiumVolume: "Rolling 24h USDC premium traded, summed over all listed option instruments (quoteVolume24h from GET /instruments, all pages).",
};

const breakdownMethodology = {
    NotionalVolume: {
        "Options notional": "Underlying value of option contracts traded in the last 24h, per Rocket's indexer aggregate.",
    },
    PremiumVolume: {
        "Options premiums": "USDC premium paid by option buyers in the last 24h.",
    },
};

const adapter: SimpleAdapter = {
    // version 1: both endpoints only return rolling 24-hour aggregates (no historical time ranges)
    version: 1,
    runAtCurrTime: true,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    start: '2026-08-31',
    methodology,
    breakdownMethodology,
};

export default adapter;
