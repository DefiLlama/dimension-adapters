import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const url = `https://app.gensuki.xyz/api/defillama/swap?chain=${options.chain}`;
  const res = await fetchURL(url);
  const dayData = res.history?.find((h: any) => h.date === options.dateString);

  return {
    dailyVolume: dayData ? dayData.volumeUsd : 0,
    dailyFees: dayData ? dayData.revenueUsd : 0,
    dailyRevenue: dayData ? dayData.revenueUsd : 0,
    dailyProtocolRevenue: dayData ? dayData.revenueUsd : 0,
    dailyTransactionsCount: dayData ? dayData.txCount : 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2020-03-16',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2020-05-31',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2023-08-09',
    },
    [CHAIN.SEI]: {
      fetch,
      start: '2023-08-15',
    },
    [CHAIN.APECHAIN]: {
      fetch,
      start: '2024-10-20',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2021-08-31',
    },
    [CHAIN.ABSTRACT]: {
      fetch,
      start: '2025-01-28',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2020-08-31',
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2015-07-30',
    },
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: '2026-07-01',
    },
  },
  methodology: {
    Fees: "Users pay a swap aggregator fee of 1.0% on swaps and bridge transactions.",
    Revenue: "Protocol collects a 1.0% fee on all swaps and bridge transactions.",
    ProtocolRevenue: "All fee revenue is sent to the fee receiver wallets: 84L37ZcjLih9HNP4Np8yrTTQkdUx5aw3CYcx4ajboamT on Solana and 0xC34E5159AA94dDf235790836Dc4bD4b2789B1fB9 on Base chain.",
    Volume: "Trading volume from aggregated swaps and bridges across all chains."
  }
};

export default adapter;