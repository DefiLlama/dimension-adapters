import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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

const fetch = async () => {
  const response: IAPIResponse = (await fetchURL(URL));
  const dailyVolume = Number(response.last_day_total_volume_in_usd);

  const dailyFees = dailyVolume * TOTAL_FEE;
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyVolume * PROTOCOL_FEE,
    dailyProtocolRevenue: dailyVolume * PROTOCOL_FEE,
    dailySupplySideRevenue: dailyVolume * LP_FEE,
  };
};

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
};

export default adapter;
