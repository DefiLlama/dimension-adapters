import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";


interface IVolume {
  value: number;
  humanTime: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const url = `https://api.solscan.io/amm/chart?source=openbook&type=all&chart=total_volume24h`;
  const historicalVolume: IVolume[] = (await fetchURL(url)).data.data.items;
  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.humanTime.split('T')[0]).getTime() / 1000) === dayTimestamp)?.value

  return {
    timestamp: dayTimestamp,
    dailyVolume: `${dailyVolume ? Number(dailyVolume) : 0}`,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: async () => 1669420800,
    },
  },
};

export default adapter;
