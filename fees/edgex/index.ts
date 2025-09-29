import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FetchResultFees, FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const API_ENDPOINT = "https://pro.edgex.exchange/api/v1/public/quote/fee";

interface IEdgeXFeeResponse {
  code: string;
  data: {
    dayTimestamp: number;
    fee: string;
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
  const dailyRevenue = dayData.fee;

  return {
    dailyFees,
    dailyRevenue,
    timestamp: options.startOfDay,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.EDGEX]: {
      fetch,
      start: '2025-02-25',
    },
  },
};

export default adapter; 