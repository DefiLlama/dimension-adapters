import fetchURL from "../../utils/fetchURL"
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const URL = "https://mainnet.analytics.tinyman.org/api/v1/general-statistics/"

// https://docs.tinyman.org/tinyman-v1/fees
// 0.3% total swap fee: 5/6 (0.25%) to LPs, 1/6 (0.05%) to Tinyman Treasury
const TOTAL_FEE = 0.003;
const LP_FEE = 0.0025;
const PROTOCOL_FEE = 0.0005;

interface IAPIResponse {
  total_liquidity_in_usd: string;
  last_day_total_volume_in_usd: string;
  last_day_algo_price_change: string;
};

const fetch = async (options: FetchOptions) => {
  const response: IAPIResponse = (await fetchURL(URL));
  const dailyVolume = Number(response.last_day_total_volume_in_usd);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(dailyVolume * TOTAL_FEE, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(dailyVolume * PROTOCOL_FEE, "Token Swap Fees to Protocol");
  dailySupplySideRevenue.addUSDValue(dailyVolume * LP_FEE, "Token Swap Fees to LPs");

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "0.3% fee charged on every swap.",
  },
  Revenue: {
    "Token Swap Fees to Protocol": "1/6 of swap fees (0.05%) sent to the Tinyman Treasury.",
  },
  ProtocolRevenue: {
    "Token Swap Fees to Protocol": "1/6 of swap fees (0.05%) sent to the Tinyman Treasury.",
  },
  SupplySideRevenue: {
    "Token Swap Fees to LPs": "5/6 of swap fees (0.25%) distributed to liquidity providers.",
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ALGORAND],
  runAtCurrTime: true,
  methodology: {
    Fees: "0.3% fee charged on every swap.",
    UserFees: "0.3% fee paid by traders on every swap.",
    Revenue: "1/6 of swap fees (0.05%) sent to the Tinyman Treasury.",
    ProtocolRevenue: "1/6 of swap fees (0.05%) sent to the Tinyman Treasury.",
    SupplySideRevenue: "5/6 of swap fees (0.25%) distributed to liquidity providers.",
  },
  breakdownMethodology,
};

export default adapter;
