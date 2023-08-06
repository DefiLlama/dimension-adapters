import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.dydx.exchange/v3/stats?days=1"
const candles = (market: string, fromISO: string) => `https://api.dydx.exchange/v3/candles/${market}?resolution=1DAY&fromISO=${fromISO}`

interface IVolumeall {
  usdVolume: string;
  startedAt: string;
}

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const fromTimestamp = dayTimestamp - 60 * 60 * 24
  const fromISO = new Date(fromTimestamp * 1000).toISOString();
  const dateString = new Date(dayTimestamp * 1000).toISOString();
  const markets: string[] = Object.keys((await fetchURL(historicalVolumeEndpoint))?.data.markets);
  const historical: IVolumeall[] = (await Promise.all(markets.map((market: string) => fetchURL(candles(market, fromISO))))).map((e: any) => e.data.candles).flat()
  const dailyolume = historical.filter((e: IVolumeall) => e.startedAt === dateString)
    .reduce((a: number, b: IVolumeall) => a+Number(b.usdVolume), 0)
  return {
    dailyVolume: dailyolume ? `${dailyolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: async () => 1614211200,
    },
  },
};

export default adapter;
