import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SUMMARY_URL = "https://indexer.protonnz.com/api/defillama/summary";

const fetch = async (_options: FetchOptions) => {
  const data = await fetchURL(SUMMARY_URL);
  return {
    dailyVolume: data.dailyVolume,
    totalVolume: data.totalVolume,
    dailyFees: data.dailyFees,
    dailyUserFees: data.dailyUserFees,
    dailyRevenue: data.dailyRevenue,
    dailySupplySideRevenue: data.dailySupplySideRevenue,
    totalFees: data.totalFees,
    totalRevenue: data.totalRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.PROTON]: {
      fetch,
      start: "2026-02-15",
      runAtCurrTime: true,
    },
  },
};

export default adapter;
