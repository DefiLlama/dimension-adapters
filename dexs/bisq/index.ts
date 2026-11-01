import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://markets.bisq.network/api/volumes?interval=day"

interface IVolumeall {
  volume: string;
  period_start: number;
}

const fetch = async ({ startOfDay, dateString, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances()

  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  const dayItem = historicalVolume.find(dayItem => dayItem.period_start === startOfDay)
  if (!dayItem) {
    const latestDay = new Date(historicalVolume[historicalVolume.length - 1].period_start * 1000).toISOString().slice(0, 10)
    throw new Error(`Bisq markets API has no volume for ${dateString} (latest day: ${latestDay})`)
  }
  dailyVolume.addCGToken('bitcoin', +dayItem.volume)

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BITCOIN]: {
      fetch,
      start: '2018-05-07',
    },
  },
};

export default adapter;
