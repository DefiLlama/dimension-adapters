import { CHAIN } from "../../helpers/chains";
import { FetchV2, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const API_ENDPOINT = "https://api.zunami.app/llama/revenue";

interface RevenueData {
  dailyRevenue: number;
  totalRevenue: number;
}

const fetchData: FetchV2 = async () => {
  const data: RevenueData = await fetchURL(API_ENDPOINT);

  return {
    dailyFees: data.dailyRevenue,
    totalFees: data.totalRevenue,
    dailyRevenue: data.dailyRevenue,
    totalRevenue: data.totalRevenue,
  };
};

const methodology = {
  Fees: "Protocol collects fees from ETH/USD/BTC Omnipool rewards, APS performance fees, and redemption fees for zunStable swaps.",
  Revenue: "100% of collected fees are distributed to pool token holders.",
  HoldersRevenue: "100% of collected fees are distributed to pool token holders.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2024-06-06',
      fetch: fetchData,
      runAtCurrTime: true,
    },
  },
  methodology,
};

export default adapter;
