import { ChainBlocks, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const endpointsV2 = {
  [CHAIN.MANTLE]: "https://barn.merchantmoe.com/v1/lb/dex/analytics/mantle?startTime=1712844491&aggregateBy=daily"
}

interface IData {
  feesUsd: number;
  protocolFeesUsd: number;
  volumeUsd: number;
  timestamp: number;
}

const graph = async (timestamp: number, _c: ChainBlocks, { chain }: FetchOptions): Promise<FetchResult> => {
  const dayTimestamp = getTimestampAtStartOfDayUTC(timestamp)
  const historical: IData[] = (await httpGet(endpointsV2[chain]));
  const dailyFees = historical
    .find(dayItem => dayItem.timestamp === dayTimestamp)?.feesUsd || 0
  const dailyRevenue = historical
    .find(dayItem => dayItem.timestamp === dayTimestamp)?.protocolFeesUsd || 0
  const dailyVolume = historical
    .find(dayItem => dayItem.timestamp === dayTimestamp)?.volumeUsd || 0
  return {
    dailyVolume:`${dailyVolume}`,
    dailyUserFees: `${dailyFees}`,
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    dailyHoldersRevenue: `${dailyRevenue}`,
    dailySupplySideRevenue: dailyFees ? `${(dailyFees || 0) - (dailyRevenue || 0)}` : undefined,
    dailyProtocolRevenue: `${dailyRevenue}`,
    timestamp
  }

}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.MANTLE]: {
      fetch: graph,
      start: 1709251200
    }
  }
}
export default adapter
