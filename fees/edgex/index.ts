import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FetchResultFees, ProtocolType, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

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

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const reportTimestampSec = options.startOfDay;
  const queryStartTimestampSec = reportTimestampSec - 86400;

  if (isNaN(queryStartTimestampSec)) {
    console.error(`[edgeX] Invalid calculated queryStartTimestampSec: ${queryStartTimestampSec} from reportTimestampSec: ${reportTimestampSec}`);
    throw new Error(`Invalid calculated queryStartTimestampSec`);
  }

  const queryStartTimestampMs = queryStartTimestampSec * 1000;
  const queryEndTimestampMs = reportTimestampSec * 1000;

  const apiUrl = `${API_ENDPOINT}?filterBeginKlineTimeInclusive=${queryStartTimestampMs}&filterEndKlineTimeExclusive=${queryEndTimestampMs}`;

  try {
    const response: IEdgeXFeeResponse = await fetchURL(apiUrl);

    if (response.code !== 'SUCCESS') {
      console.error(`EdgeX API Error: Code=${response.code}, Msg=${response.msg || 'Unknown error'}`);
      throw new Error(`EdgeX API Error: Code=${response.code}, Msg=${response.msg || 'Unknown error'}`);
    }

    const dayData = response.data.find(item => item.dayTimestamp === queryStartTimestampMs);

    if (!dayData) {
      console.warn(`No fee data found for timestamp ${queryStartTimestampSec} (ms: ${queryStartTimestampMs}) in edgeX response`);
      return {
        dailyFees: "0",
        dailyRevenue: "0",
        timestamp: reportTimestampSec,
      };
    }

    const dailyFees = dayData.fee;
    const dailyRevenue = dayData.fee;

    return {
      dailyFees: dailyFees,
      dailyRevenue: dailyRevenue,
      timestamp: reportTimestampSec,
    };

  } catch (error) {
    console.error(`Failed to fetch edgeX fees: ${error}`);
    throw error;
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-02-25',
    },
  },
  protocolType: ProtocolType.PROTOCOL,
};

export default adapter; 