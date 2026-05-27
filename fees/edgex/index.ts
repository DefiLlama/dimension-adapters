import { CHAIN } from "../../helpers/chains";
import { FetchResultFees, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";
import { httpGet } from "../../utils/fetchURL";

const API_ENDPOINT = "https://pro.edgex.exchange/api/v1/public/quote/fee";

interface IEdgeXFeeResponse {
  code: string;
  data: {
    dayTimestamp: number;
    fee: string;
    revenue: string;
  }[];
  msg: string | null;
  errorParam: string | null;
  requestTime: string;
  responseTime: string;
  traceId: string;
}

const fetch = async (_: any, _1: any, options: FetchOptions): Promise<FetchResultFees> => {
  const apiUrl = `${API_ENDPOINT}?filterBeginKlineTimeInclusive=${(options.fromTimestamp - 800) * 1000}&filterEndKlineTimeExclusive=${options.toTimestamp * 1000}`;

  const { data }: IEdgeXFeeResponse = await httpGet(apiUrl)

  const startOfDayUTC = options.startOfDay * 1000;
  const dayData = data.find(item => item.dayTimestamp === startOfDayUTC);

  if (!dayData) {
    throw new Error(`No fee data found for timestamp ${options.dateString} (ms: ${startOfDayUTC}) in edgeX response`);
  }

  const dailyFees = dayData.fee;
  const dailyRevenue = dayData.revenue;
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = Number(dailyFees) - Number(dailyRevenue)

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const fetchBB = async (_a:any, _b:any, options: FetchOptions) => {
  const dailyHoldersRevenue = await addTokensReceived({
    options,
    target: '0x221e7fca09589ab2d7dc552ee72acf1a2ff10048',
    token: '0xb0076de78dc50581770bba1d211ddc0ad4f2a241',
  });
  const dailyFees = options.createBalances();
  return { dailyFees, dailyRevenue: dailyFees, dailySupplySideRevenue: dailyFees, dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.EDGEX]: { fetch, start: '2025-02-25'},
    [CHAIN.ETHEREUM]: { fetch: fetchBB, start: '2026-04-01'},
  },
};

export default adapter; 
