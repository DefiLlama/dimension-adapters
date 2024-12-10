import fetchURL from "../../utils/fetchURL"
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://static.plunderswap.com/volume-history"

interface IVolumeall {
  value: string;
  time: string;
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, startOfDay, }: FetchOptions) => {
  const dailyVolume = createBalances()
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  
  // Find the entry closest to the start of day
  const closestEntry = historicalVolume
    .reduce((closest, current) => {
      const currentTime = new Date(current.time).getTime() / 1000;
      const closestTime = new Date(closest.time).getTime() / 1000;
      return Math.abs(currentTime - dayTimestamp) < Math.abs(closestTime - dayTimestamp) 
        ? current 
        : closest;
    });

  if (closestEntry) {
    dailyVolume.addCGToken("zilliqa", Number(closestEntry.value));
  }

  return { dailyVolume, timestamp: startOfDay, };
};

const adapter: SimpleAdapter = {
  adapter: {
    zilliqa: {
      fetch,
      runAtCurrTime: true,
      start: '2024-12-10',
      meta: {
        methodology: {
          Volume: "Volume of all trades on Plunderswap at the start of the day (12:00:00 UTC) for the previous day"
        }
      }
    },
  },
};

export default adapter;
