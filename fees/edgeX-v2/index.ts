import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

// Holders revenue is calculated in edgex-v1 and resembles all products buyback
const API_ENDPOINT = "https://edgex-prod-v2.edgex.exchange/api/v2/public/quote/fee";

interface EdgeXFeeResponse {
  data: {
    dayTimestamp: number;
    fee: string;
    revenue: string;
  }[];
}

const fetch = async (options: FetchOptions) => {
  const apiUrl = `${API_ENDPOINT}?filterBeginKlineTimeInclusive=${(options.fromTimestamp - 800) * 1000}&filterEndKlineTimeExclusive=${options.toTimestamp * 1000}`;
  const { data }: EdgeXFeeResponse = await fetchURL(apiUrl);
  const startOfDayUTC = options.startOfDay * 1000;
  const dayData = data.find((item) => item.dayTimestamp === startOfDayUTC);

  if (!dayData) {
    throw new Error(`No fee data found for timestamp ${options.dateString} (ms: ${startOfDayUTC}) in edgeX v2 response`);
  }

  const fees = Number(dayData.fee);
  const revenue = Number(dayData.revenue);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(fees, METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(revenue, METRIC.PROTOCOL_FEES);
  dailySupplySideRevenue.addUSDValue(fees - revenue, 'Referral Rewards');

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total trading fees paid by users on edgeX v2.",
  Revenue: "The portion of trading fees kept by the protocol.",
  SupplySideRevenue: "The portion of trading fees distributed as referral rewards.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "All trading fees paid by users on edgeX v2.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Trading fees kept by the edgeX protocol.",
  },
  SupplySideRevenue: {
    'Referral Rewards': "The portion of trading fees distributed as referral rewards.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.EDGEX],
  start: "2026-05-12",
  methodology,
  breakdownMethodology,
};

export default adapter;
