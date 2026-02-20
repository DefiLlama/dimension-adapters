import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const historicalVolumeEndpoint = "https://api.dydx.exchange/v3/markets"
const stats = (market: string) => `https://api.dydx.exchange/v3/stats/${market}?days=1`

interface IStats {
  fees: string;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const markets: string[] = Object.keys((await fetchURL(historicalVolumeEndpoint)).markets);
  const historical: IStats[] = (await Promise.all(markets.map((market: string) => fetchURL(stats(market))))).map((e: any) => Object.values(e.markets) as unknown as IStats).flat()
  const dailyFees = historical.filter((e: IStats) => e.fees !== '0')
    .reduce((a: number, b: IStats) => a+Number(b.fees), 0)
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  deadFrom: '2024-12-14',
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-11-18',
      // runAtCurrTime: true,
    },
  },
};

export default adapter;
