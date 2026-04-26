import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { httpGet } from "../utils/fetchURL";

const API_URL = "https://production.kyan.sh/api/v1/defillama/overview";
const ONE_DAY = 24 * 60 * 60;

const fetch = async (options: FetchOptions) => {
  const data = await httpGet(API_URL);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - data.timestamp) > ONE_DAY)
    throw new Error("Kyan API data is stale (older than 24h)");

  const dailyFees = options.createBalances();

  dailyFees.addUSDValue(+data.fees.daily_fees_usd, METRIC.SWAP_FEES);
  dailyFees.addUSDValue(+data.liquidations.fees_usd, METRIC.LIQUIDATION_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2026-04-25",
      runAtCurrTime: true,
    },
  },
  methodology: {
    Fees: 'Trading and liquidation fees paid by users',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by users from all trades.",
      [METRIC.LIQUIDATION_FEES]: "Fees paid by users from liquidations.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "Swap fees paid by users from all trades.",
      [METRIC.LIQUIDATION_FEES]: "Fees paid by users from liquidations.",
    },
  },
};

export default adapter;
