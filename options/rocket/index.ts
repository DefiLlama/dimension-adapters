/*
 * DeFiLlama Options Adapter for Rocket
 *
 * Tracks daily notional volume and premium volume for options traded on
 * Rocket - a high-performance L1 blockchain for trading derivatives.
 *
 * Data sources:
 *   GET /indexer/options-volume-24h - rolling 24h notional options volume per underlying (BTC, ETH),
 *                                     Rocket's own aggregate (same figure shown in the Rocket UI)
 *   GET /instruments                - per-instrument rolling 24h stats; quoteVolume24h on option
 *                                     instruments is the USDC premium traded
 *
 * Website: https://rocketfi.io
 * API Docs: https://api.docs.rocketfi.io/
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const ROCKET_API = "https://beta.rocket-cluster-1.com";

type InstrumentType = "PERP" | "FUTURE" | "CALL_OPTION" | "PUT_OPTION";

interface OptionsVolumeResponse {
    volumes: { underlyingAsset: string; notionalVolume24hr: string }[];
}

interface Instrument {
    id: string;
    ticker: string;
    instrumentType: InstrumentType;
    underlyingAsset: string;
}

interface InstrumentStats {
    volume24h: string;
    quoteVolume24h: string;
    openInterest: number;
}

interface InstrumentsResponse {
    instruments: Record<string, Instrument>;
    instrumentStats: Record<string, InstrumentStats>;
}

const isOption = (t: InstrumentType) => t === "CALL_OPTION" || t === "PUT_OPTION";

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
    const { instruments, instrumentStats }: InstrumentsResponse = await fetchURL(`${ROCKET_API}/instruments`);
    for (const [id, stats] of Object.entries(instrumentStats)) {
        const inst = instruments[id];
        if (!inst) {
            console.log(`Rocket options: stats returned for unknown instrument ${id}, skipping`);
            continue;
        }
        if (!isOption(inst.instrumentType)) continue;
        dailyPremiumVolume.addUSDValue(Number(stats.quoteVolume24h ?? 0), "Options premiums");
    }

    return { dailyNotionalVolume, dailyPremiumVolume };
};

const methodology = {
    NotionalVolume: "Rolling 24h notional volume of all listed BTC and ETH options (contracts traded x underlying value) as reported by Rocket's indexer (GET /indexer/options-volume-24h).",
    PremiumVolume: "Rolling 24h USDC premium traded, summed over all listed option instruments (quoteVolume24h from GET /instruments).",
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
    version: 2,
    runAtCurrTime: true,
    // Rocket exposes rolling 24-hour totals only, so hourly slices cannot be summed.
    pullHourly: false,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    start: '2026-08-31',
    methodology,
    breakdownMethodology,
};

export default adapter;
