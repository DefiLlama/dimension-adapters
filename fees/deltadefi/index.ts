import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const FEES_API = "https://api-internal-metrics.deltadefi.io/public/fees/daily";

const fetch = async ({ startOfDay }: any) => {
  const response = await httpGet(`${FEES_API}?timestamp=${startOfDay}`);
  const dailyFees = response.daily_fees_usd;

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    timestamp: startOfDay,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2026-01-26",
    },
  },
  methodology: {
    Fees: "DeltaDeFi Spot Orderbook order execution fee.",
    Revenue: "Same as Fees.",
  },
};

export default adapter;
