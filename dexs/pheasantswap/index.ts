import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://info.pheasantswap.com/swap/operate/getSwapStatisticsList"

interface IVolumeall {
  amount: string;
  date: string;
}

const fetch = async (options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.toTimestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).volumeList;
  const dailyVolume = historicalVolume
    .find(dayItem => Number(dayItem.date) === dayTimestamp)?.amount

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ENULS],
  start: '2023-04-24',
  deadFrom: '2025-03-01',
};

export default adapter;
