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

  // Format the timestamp without milliseconds
  const targetTime = new Date(dayTimestamp * 1000).toISOString().replace('.000Z', 'Z');

  // Filter entries to find exact 00:00 UTC entry of the current day
  const dayEntries = historicalVolume.filter(entry => {
    return entry.time === targetTime;
  });

  if (dayEntries.length > 0) {
    dailyVolume.addCGToken("zilliqa", Number(dayEntries[0].value));
  }

  return { dailyVolume, timestamp: startOfDay, };
};

const adapter: SimpleAdapter = {
  adapter: {
    zilliqa: {
      fetch: fetch,
      start: '2024-12-10',
    },
  },
  methodology: {
    Volume: "Volume of trades on Plunderswap at the start of the day (00:00:00 UTC) for the previous day"
  }
};

export default adapter;
