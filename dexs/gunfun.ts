import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

//Recepient: DoX6NFeLnSgeQsCYKAtUVCPtXZo6xBsyJFCBaXW3crQK
const fetch = async (options: FetchOptions) => {
  const url = "https://app.gensuki.xyz/api/defillama/gunfun";
  const res = await fetchURL(url);
  const dayData = res.history?.find((h: any) => h.date === options.dateString);
  if (!dayData) {
    throw new Error(`Data not found for date: ${options.dateString}`);
  }

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(dayData.revenueUsd, "Launchpad Fees");

  return {
    dailyVolume: dayData.volumeUsd,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: "Trading volume from presales and memecoin transactions on Gunfun.",
  Fees: "Users pay a platform fee of 1.5% on presales and memecoin transactions on Gunfun.",
  Revenue: "Protocol collects a 1.5% fee on all presales and memecoin transactions.",
  ProtocolRevenue: "Protocol collects a 1.5% fee on all presales and memecoin transactions.",
}

const breakdownMethodology = {
  Fees: {
    "Launchpad Fees": "Users pay a platform fee of 1.5% on presales and memecoin transactions on Gunfun.",
  },
  Revenue: {
    "Launchpad Fees": "Protocol collects a 1.5% fee on all presales and memecoin transactions.",
  },
  ProtocolRevenue: {
    "Launchpad Fees": "Protocol collects a 1.5% fee on all presales and memecoin transactions.",
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2026-02-07',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
