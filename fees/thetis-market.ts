import BigNumber from "bignumber.js";
import { Adapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphFees";
import { CHAIN } from "../helpers/chains";

const endpoint = "https://api.thetis.market/indexer/v1/stats/";

const fetch = async (timestamp: number) => {
  const startTime = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const endTime = startTime + 86400;

  const feeRes = await fetchURL(
    `${endpoint}fee-daily?startTime=${startTime}&endTime=${endTime}`
  );

  if (feeRes.length) {
    const dailyFees = new BigNumber(feeRes[0].total).dividedBy(1e18);
    const totalFees = new BigNumber(feeRes[0].cumulative).dividedBy(1e18);

    return {
      totalFees: totalFees.toString(),
      totalSupplySideRevenue: totalFees.times(80).dividedBy(100).toString(),
      totalRevenue: totalFees.times(20).dividedBy(100).toString(),
      dailyFees: dailyFees.toString(),
      dailySupplySideRevenue: dailyFees.times(80).dividedBy(100).toString(),
      dailyRevenue: dailyFees.times(20).dividedBy(100).toString(),
      timestamp: startTime,
    };
  }

  return {
    totalFees: 0,
    totalSupplySideRevenue: 0,
    totalRevenue: 0,
    dailyFees: 0,
    dailySupplySideRevenue: 0,
    dailyRevenue: 0,

    timestamp: startTime,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: "2024-08-09",
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
