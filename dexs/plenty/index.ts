import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface IVolumeall {
  value: string;
  time: string;
}
const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
  const plentyData: IVolumeall[] = (await fetchURL("https://analytics.plenty.network/api/v1/overall-volume/24hours"));
  const dailyVolumeItem = plentyData.find(e => e.time === dateString)?.value

  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyVolumeItem,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TEZOS]: {
      fetch: fetch,
      start: '2023-01-01',
    },
  },
};

export default adapter
