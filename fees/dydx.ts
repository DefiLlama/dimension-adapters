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
    dailyFees: dailyFees ? `${dailyFees}` : undefined,
    dailyRevenue: dailyFees ? `${dailyFees}` : undefined,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 1700265600,
      // runAtCurrTime: true,
    },
  },
};

export default adapter;
