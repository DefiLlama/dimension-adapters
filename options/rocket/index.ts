/*
 * DeFiLlama Options Adapter for Rocket
 *
 * Tracks daily notional volume, premium volume and open interest for
 * options traded on Rocket - a high-performance L1 blockchain for
 * trading derivatives.
 *
 * Data source:
 *   GET /instruments - all instruments (PERP / FUTURE / CALL_OPTION / PUT_OPTION)
 *                      with 24h rolling stats per instrument
 *
 * Website: https://rocketfi.io
 * API Docs: https://api.docs.rocketfi.io/
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const ROCKET_API = "https://beta.rocket-cluster-1.com";

const isOption = (t: string) => t === "CALL_OPTION" || t === "PUT_OPTION";

const fetch = async (_options: FetchOptions) => {
    const data = await fetchURL(`${ROCKET_API}/instruments`);
    const instruments: Record<string, any> = data.instruments;
    const instrumentStats: Record<string, any> = data.instrumentStats;

    // Underlying index price taken from the corresponding perp market
    const underlyingPrice: Record<string, number> = {};
    for (const inst of Object.values(instruments) as any[]) {
        if (inst.instrumentType === "PERP")
            underlyingPrice[inst.underlyingAsset] = Number(inst.lastMatchPrice);
    }

    let dailyNotionalVolume = 0;
    let dailyPremiumVolume = 0;
    let openInterestAtEnd = 0;

    for (const [id, stats] of Object.entries(instrumentStats)) {
        const inst = instruments[id];
        if (!inst || !isOption(inst.instrumentType)) continue;
        const price = underlyingPrice[inst.underlyingAsset];
        if (!price) continue;
        // volume24h & openInterest are denominated in contracts (1 contract = 1 unit of underlying)
        dailyNotionalVolume += Number(stats.volume24h ?? 0) * price;
        // quoteVolume24h is the premium traded, already in USDC
        dailyPremiumVolume += Number(stats.quoteVolume24h ?? 0);
        openInterestAtEnd += Number(stats.openInterest ?? 0) * price;
    }

    return { dailyNotionalVolume, dailyPremiumVolume, openInterestAtEnd };
};

const methodology = {
    NotionalVolume: "Sum of 24h traded option contracts multiplied by the underlying index price (from the corresponding Rocket perp market), across all listed BTC and ETH options.",
    PremiumVolume: "Sum of 24h traded option premium (USDC quote volume) across all listed options.",
    OpenInterest: "Sum of outstanding option contracts multiplied by the underlying index price.",
};

const adapter: SimpleAdapter = {
    version: 2,
    runAtCurrTime: true,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    start: '2026-08-31',
    methodology,
};

export default adapter;
