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
import { ROCKET_API, fetchRocketInstruments, isRocketOption } from "../../helpers/rocket";

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
    for (const [id, stats] of Object.entries(instrumentStats)) {
        const inst = instruments[id];
        if (!inst) {
            console.log(`Rocket options: stats returned for unknown instrument ${id}, skipping`);
            continue;
        }
        if (!isRocketOption(inst.instrumentType)) continue;
        const raw = stats.quoteVolume24h;
        const premium = raw === undefined || raw === null || String(raw).trim() === "" ? NaN : Number(raw);
        if (!Number.isFinite(premium)) {
            console.log(`Rocket options: missing/invalid quoteVolume24h for ${inst.ticker}: ${JSON.stringify(raw)}, skipping`);
            continue;
        }
        dailyPremiumVolume.addUSDValue(premium, "Options premiums");
    }

    return { dailyNotionalVolume, dailyPremiumVolume };
};

const methodology = {
    NotionalVolume: "Rolling 24h notional volume of all listed BTC and ETH options (contracts traded x underlying value) as reported by Rocket's indexer (GET /indexer/options-volume-24h).",
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
