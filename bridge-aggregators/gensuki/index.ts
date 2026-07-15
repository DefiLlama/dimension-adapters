import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const url = `https://app.gensuki.xyz/api/defillama/bridge?chain=${options.chain}`;
  const res = await fetchURL(url);
  const dayData = res.history?.find((h: any) => h.date === options.dateString);

  return {
    dailyBridgeVolume: dayData ? dayData.volumeUsd : 0,
    dailyFees: dayData ? dayData.revenueUsd : 0,
    dailyRevenue: dayData ? dayData.revenueUsd : 0,
    dailyProtocolRevenue: dayData ? dayData.revenueUsd : 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // API returns daily historical data, so we don't need to run hourly (prevents data inflation)
  pullHourly: false,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2026-07-12',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2026-07-12',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2026-07-12',
    },
    [CHAIN.SEI]: {
      fetch,
      start: '2026-07-12',
    },
    [CHAIN.APECHAIN]: {
      fetch,
      start: '2026-07-12',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2026-07-12',
    },
    [CHAIN.ABSTRACT]: {
      fetch,
      start: '2026-07-12',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2026-07-12',
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2026-07-12',
    },
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: '2026-07-12',
    },
  },
  methodology: {
    Fees: "Users pay a bridge fee of 1.0% on bridge transactions.",
    Revenue: "Protocol collects a 1.0% fee on all bridge transactions.",
    ProtocolRevenue: "All fee revenue is sent to the fee receiver wallets: 84L37ZcjLih9HNP4Np8yrTTQkdUx5aw3CYcx4ajboamT on Solana and 0xC34E5159AA94dDf235790836Dc4bD4b2789B1fB9 on Base chain.",
    Volume: "Trading volume from aggregated bridges across all chains."
  }
};

export default adapter;
