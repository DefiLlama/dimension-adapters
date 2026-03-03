import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const endpoint = "https://api.thetis.market/indexer/v1/stats/fee-daily";

const fetch = async (timestamp: number) => {
  const startTime = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const data = await fetchURL(endpoint);

  let dailyFees = 0;
  for (const item of data) {
    if (item.time == startTime) {
      dailyFees += (item.total / 1e18);
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees * 0.8,
    dailyRevenue: dailyFees * 0.2,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.APTOS],
  deadFrom: '2025-09-09',
  start: "2024-11-26",
  methodology: {
    Fees: "All fees for adding/removing liquidity, margin, liquidation, and swaps are collected",
    SupplySideRevenue: "SupplySideRevenue is 80% of the total fees, which are distributed to LP stakers",
    Revenue: "Revenue is 20% of the total fees",
  },
};

export default adapter;
