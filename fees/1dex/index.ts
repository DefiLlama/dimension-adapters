import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

async function fetch({ createBalances }: FetchOptions) {
  const endpoint = `https:///api.1dex.com/24h-fees-info`;
  const {
    data: { trade_fees: tradeFeesUsd },
  } = await httpGet(endpoint);

  const dailyFees = createBalances();
  dailyFees.addUSDValue(tradeFeesUsd, METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
}

const methodology = {
  Fees: "Trading fees paid by users on the 1DEX platform",
  Revenue: "All trading fees are retained by the protocol",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by users on the 1DEX DEX",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Trading fees retained by the protocol",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.EOS]: {
      fetch,
      start: "2025-04-26",
      runAtCurrTime: true,
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
