import fetchURL from "../../utils/fetchURL"
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.zilstream.com/volume"

interface IVolumeall {
  value: string;
  time: string;
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, startOfDay, }: FetchOptions) => {
  const dailyVolume = createBalances()
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  const _dailyVolume = historicalVolume.filter(volItem => (new Date(volItem.time.split('T')[0]).getTime() / 1000) === dayTimestamp);
  const __dailyVolume = Math.abs(Number(_dailyVolume[0].value) - Number(_dailyVolume[_dailyVolume.length - 1].value))
  dailyVolume.addCGToken("zilliqa", __dailyVolume)
  return { dailyVolume, timestamp: startOfDay, };
};

const adapter: SimpleAdapter = {
  adapter: {
    zilliqa: {
      fetch,
      runAtCurrTime: true,
      start: '2023-01-07',
    },
  },
};

export default adapter;
