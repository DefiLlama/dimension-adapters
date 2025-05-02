import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphFees";
import fetchURL from "../utils/fetchURL";

const endpoint = "https://api.thetis.market/indexer/v1/stats/";

const fetch = async (timestamp: number) => {
  const startTime = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const endTime = startTime + 86400;

  const [{ total, cumulative } = { total: 0, cumulative: 0 }] = [] = await fetchURL(
    `${endpoint}fee-daily?startTime=${startTime}&endTime=${endTime}`
  );

  const dailyFees = total / 1e18
  const totalFees = cumulative / 1e18

  return {
    totalFees,
    totalSupplySideRevenue: totalFees * 0.8,
    totalRevenue: totalFees * 0.2,
    dailyFees,
    dailySupplySideRevenue: dailyFees * 0.8,
    dailyRevenue: dailyFees * 0.2,
    timestamp: startTime,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: "2024-11-26",
      meta: {
        methodology: {
          Fees: "All fees for adding/removing liquidity, margin, liquidation, and swaps are collected",
          SupplySideRevenue:
            "SupplySideRevenue is 80% of the total fees, which are distributed to LP stakers",
          Revenue: "Revenue is 20% of the total fees",
        },
      },
    },
  },
};

export default adapter;
