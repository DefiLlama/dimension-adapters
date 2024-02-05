import { Chain } from "@defillama/sdk/build/general"
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { FetchResultVolume } from "../../adapters/types";

interface IData {
  timestamp: number;
  volume: number;
}
const url = 'https://storage.kwenta.io/25710180-23d8-43f4-b0c9-5b7f55f63165-bucket/data/stats/daily_stats.json';
const fetchData = (_: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const value: IData[] = (await fetchURL(url));
    const dailyVolume = value.find((d) => d.timestamp === todaysTimestamp)?.volume;
    const totalVolume  = value.filter((e: IData) => e.timestamp <= todaysTimestamp)
      .reduce((acc: number, e: IData) => acc + e.volume, 0)
    return {
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      totalVolume: totalVolume ? `${totalVolume}` : undefined,
      timestamp: todaysTimestamp
    }
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetchData(CHAIN.OPTIMISM),
      start: 1682121600,
    },
  }
};

export default adapter;
