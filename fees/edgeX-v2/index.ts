import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API_ENDPOINT = "https://edgex-prod-v2.edgex.exchange/api/v2/public/quote/fee";

interface EdgeXFeeResponse {
  data: {
    dayTimestamp: number;
    fee: string;
    revenue: string;
  }[];
}

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const apiUrl = `${API_ENDPOINT}?filterBeginKlineTimeInclusive=${(options.fromTimestamp - 800) * 1000}&filterEndKlineTimeExclusive=${options.toTimestamp * 1000}`;
  const { data }: EdgeXFeeResponse = await fetchURL(apiUrl);
  const startOfDayUTC = options.startOfDay * 1000;
  const dayData = data.find((item) => item.dayTimestamp === startOfDayUTC);

  if (!dayData) {
    throw new Error(`No fee data found for timestamp ${options.dateString} (ms: ${startOfDayUTC}) in edgeX v2 response`);
  }

  const dailyFees = dayData.fee;
  const dailyRevenue = dayData.revenue;
  const dailySupplySideRevenue = Number(dailyFees) - Number(dailyRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.EDGEX],
  start: "2026-05-12",
};

export default adapter;
