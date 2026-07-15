import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const url = "https://app.gensuki.xyz/api/defillama/gunfun";
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
      start: '2025-01-01',
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
