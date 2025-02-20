import { ChainBlocks, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

interface IData {
  feesUsd: number;
  protocolFeesUsd: number;
  volumeUsd: number;
  timestamp: number;
}

const graph = async (timestamp: number, _c: ChainBlocks, { chain, startOfDay }: FetchOptions): Promise<FetchResult> => {
  const dayTimestamp = getTimestampAtStartOfDayUTC(startOfDay)

  const queryTimestamp = dayTimestamp - 24 * 60 * 60 * 7 // 1 week 
  const endpointsV2 = {
    [CHAIN.MANTLE]: `https://barn.merchantmoe.com/v1/lb/dex/analytics/mantle?startTime=${queryTimestamp}&aggregateBy=daily`
  }

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
      start: '2024-04-01'
    }
  }
}
export default adapter
