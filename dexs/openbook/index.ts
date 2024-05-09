import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";


interface IVolume {
  volume_24h: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const url = `https://dry-ravine-67635.herokuapp.com/pairs`;
  const historicalVolume: IVolume[] = (await fetchURL(url));
  const dailyVolume = historicalVolume.reduce((a: number, b: IVolume) => a + b.volume_24h, 0);

  return {
    timestamp: dayTimestamp,
    dailyVolume: `${dailyVolume ? Number(dailyVolume) : 0}`,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1668643200,
    },
  },
};

export default adapter;
