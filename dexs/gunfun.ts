import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const url = "https://app.gensuki.xyz/api/defillama/gunfun";
  const res = await fetchURL(url);
  const dayData = res.history?.find((h: any) => h.date === options.dateString);
  if (!dayData) {
    throw new Error(`Data not found for date: ${options.dateString}`);
  }

  return {
    dailyVolume: dayData.volumeUsd,
    dailyFees: dayData.revenueUsd,
    dailyRevenue: dayData.revenueUsd,
    dailyProtocolRevenue: dayData.revenueUsd,
    dailyTransactionsCount: dayData.txCount,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2026-02-07',
    },
  },
  methodology: {
    Fees: "Users pay a platform fee of 1.5% on presales and memecoin transactions on Gunfun.",
    Revenue: "Protocol collects a 1.5% fee on all presales and memecoin transactions.",
    ProtocolRevenue: "All fee revenue is sent to the fee receiver wallet: DoX6NFeLnSgeQsCYKAtUVCPtXZo6xBsyJFCBaXW3crQK.",
    Volume: "Trading volume from presales and memecoin transactions on Gunfun."
  }
};

export default adapter;
