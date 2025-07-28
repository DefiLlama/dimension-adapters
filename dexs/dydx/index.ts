import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.dydx.exchange/v3/markets"
const candles = (market: string, fromISO: string) => `https://api.dydx.exchange/v3/candles/${market}?resolution=1DAY&fromISO=${fromISO}`

interface IVolumeall {
  usdVolume: string;
  startedAt: string;
  close: string;
  startingOpenInterest: string;
}
// interface OpenInterest {
//   date: string;
//   openInterest: string;
// }
// const url = 'https://dydx.metabaseapp.com/api/public/dashboard/5fa0ea31-27f7-4cd2-8bb0-bc24473ccaa3/dashcard/349/card/437?parameters=%5B%5D'

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const fromTimestamp = dayTimestamp - 60 * 60 * 24
  const fromISO = new Date(fromTimestamp * 1000).toISOString();
  const dateString = new Date(dayTimestamp * 1000).toISOString();
  const markets: string[] = Object.keys((await fetchURL(historicalVolumeEndpoint)).markets);
  const historical: IVolumeall[] = (await Promise.all(markets.map((market: string) => fetchURL(candles(market, fromISO))))).map((e: any) => e.candles).flat()
  const dailyVolume = historical.filter((e: IVolumeall) => e.startedAt === dateString)
    .reduce((a: number, b: IVolumeall) => a+Number(b.usdVolume), 0)
  const openInterestAtEnd = historical.filter((e: IVolumeall) => e.startedAt === dateString)
    .reduce((a: number, b: IVolumeall) => a+Number(b.startingOpenInterest) * Number(b.close), 0)
  return {
    dailyVolume,
    openInterestAtEnd,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  deadFrom: '2025-02-02',
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2021-02-25',
    },
  },
};

export default adapter;
