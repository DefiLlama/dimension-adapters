import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface IStats {
  day: string;
  blockchain: string;
  daily_volume: number;
}

const fetch: any = async (timestamp: number, _, { chain }): Promise<FetchResultVolume> => {
  const stats: IStats[] = await queryDune("4192058"); // dune.gains.result_g_trade_stats_defillama

  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dateString = new Date(dayTimestamp * 1000).toISOString().split("T")[0];

  const chainStat = stats.find((stat) => stat.day.split(" ")[0] === dateString && stat.blockchain === chain);

  return { timestamp, dailyVolume: chainStat?.daily_volume || 0 };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: { fetch, start: 1684972800 },
    [CHAIN.POLYGON]: { fetch, start: 1684972800 },
    [CHAIN.BASE]: { fetch, start: 1727351131 },
  },
};

export default adapter;
