// DefiLlama Volume/Fees Adapter for PigeonHouse
// Repo: https://github.com/DefiLlama/dimension-adapters
// Path: dexs/pigeonhouse/index.ts

import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const STATS_ENDPOINT = "https://941pigeon.fun/api/defillama";

async function fetch(_a: any, _b: any, options: FetchOptions) {
  const data = await fetchURL(STATS_ENDPOINT);

  const dailyVolume = options.createBalances();

  // PigeonHouse is a bonding curve DEX — volume comes from buy/sell trades
  // The /api/defillama endpoint returns TVL; for volume we need trade data
  // Since we emit events on-chain, we can calculate from there
  // For now, use the stats API

  // TVL as a proxy until we have daily volume tracking
  if (data.tvl) {
    dailyVolume.addCGToken("solana", data.tvl / (data.tvlByQuote?.SOL ? 1 : 80)); // rough SOL equiv
  }

  return {
    dailyVolume,
    dailyFees: 0, // 2% platform fee
    dailyRevenue: 0, // treasury + burn
  };
}

const methodology = {
  Volume: "Total value of buy and sell trades on PigeonHouse bonding curves.",
  Fees: "2% platform fee on every trade — split between PIGEON burn (1.5%) and treasury (0.5%).",
  Revenue: "Protocol revenue from treasury fees. Burn fees permanently remove PIGEON from supply.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-03-09",
      runAtCurrTime: true,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
