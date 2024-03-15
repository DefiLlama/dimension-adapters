import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import disabledAdapter from "../../helpers/disabledAdapter";

const historicalVolumeEndpoint = "https://dev.winery.land/api/v1/mainnet/assets/stats"

interface IVolumeall {
  volumeUSD: string;
  date: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.volume;
  const totalVolume = historicalVolume
    .filter(volItem =>  volItem.date <= dayTimestamp)
    .reduce((acc, { volumeUSD }) => acc + Number(volumeUSD), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.date === dayTimestamp)?.volumeUSD

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.volume;
  return historicalVolume[0].date;
}

const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.BSC]: {
      fetch,
      start: getStartTimestamp,
      customBackfill: customBackfill(CHAIN.BSC as Chain, (_chian: string) => fetch)
    },
  },
};

export default adapter;
