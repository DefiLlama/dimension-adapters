import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, FetchResultV2, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const historicalVolumeEndpoint = "https://stats.sundaeswap.finance/api/defillama/v0/global-stats/2100"

interface IVolumeall {
  volumeLovelace: number;
  day: string;
}

const fetch = async (_,_a:any,{ createBalances, startOfDay }: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = createBalances()
  const dayTimestamp = getTimestampAtStartOfDayUTC(startOfDay);
  const dateStr = new Date(dayTimestamp * 1000).toISOString().split('T')[0];
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).response;
  const volume = historicalVolume.find(dayItem => dayItem.day === dateStr)?.volumeLovelace as any
  if (!volume) {
    return {
      timestamp: dayTimestamp,
    }
  }
  dailyVolume.addGasToken(volume)
  return {
    timestamp: dayTimestamp,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: '2022-02-01',
    },
  },
};

export default adapter;
