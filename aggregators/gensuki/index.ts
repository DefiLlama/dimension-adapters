import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

//Recepients : 0xC34E5159AA94dDf235790836Dc4bD4b2789B1fB9 and 84L37ZcjLih9HNP4Np8yrTTQkdUx5aw3CYcx4ajboamT
const fetch = async (options: FetchOptions) => {
  const url = `https://app.gensuki.xyz/api/defillama/swap?chain=${options.chain}`;
  const res = await fetchURL(url);
  const dayData = res.history?.find((h: any) => h.date === options.dateString);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(dayData ? dayData.revenueUsd : 0, "Aggregator Fees");

  return {
    dailyVolume: dayData ? dayData.volumeUsd : 0,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyTransactionsCount: dayData ? dayData.txCount : 0,
  };
};

const methodology = {
  Volume: "Trading volume from aggregated swaps on gensuki aggregator.",
  Fees: "Users pay a swap aggregator fee of 1.0% on swaps.",
  Revenue: "All the aggregator fees (1% on each swap) is retained by the protocol.",
  ProtocolRevenue: "All the aggregator fees (1% on each swap) is retained by the protocol.",
}

const breakdownMethodology = {
  Fees: {
    "Aggregator Fees": "Users pay a swap aggregator fee of 1.0% on swaps.",
  },
  Revenue: {
    "Aggregator Fees": "All the aggregator fees (1% on each swap) is retained by the protocol.",
  },
  ProtocolRevenue: {
    "Aggregator Fees": "All the aggregator fees (1% on each swap) is retained by the protocol.",
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.SOLANA]: {
      start: '2026-02-23',
    },
    [CHAIN.POLYGON]: {
      start: '2026-07-15',
    },
    [CHAIN.BASE]: {
      start: '2026-02-23',
    },
    [CHAIN.SEI]: {
      start: '2026-03-25',
    },
    [CHAIN.APECHAIN]: {
      start: '2026-07-15',
    },
    [CHAIN.ARBITRUM]: {
      start: '2026-07-15',
    },
    [CHAIN.ABSTRACT]: {
      start: '2026-07-15',
    },
    [CHAIN.BSC]: {
      start: '2026-03-16',
    },
    [CHAIN.ETHEREUM]: {
      start: '2026-05-20',
    },
    [CHAIN.ROBINHOOD]: {
      start: '2026-07-15',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;