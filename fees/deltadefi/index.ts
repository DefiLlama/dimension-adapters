import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const FEES_API = "https://api-internal-metrics.deltadefi.io/public/fees/daily";

const fetch = async (options: FetchOptions) => {
  const response = await httpGet(`${FEES_API}?timestamp=${options.toTimestamp}`);
  const dailyFees = response.daily_fees_usd;

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CARDANO],
  start: "2026-01-26",
  methodology: {
    Fees: "DeltaDeFi Spot Orderbook order execution fee.",
    Revenue: "Same as Fees.",
  },
};

export default adapter;
