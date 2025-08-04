import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import fetchURL from "../utils/fetchURL";

const historicalVolumeEndpoint = "https://api-junoswap.enigma-validator.com/volumes/total/historical/12M/d"

interface IVolumeall {
  volume_total: string;
  date: string;
}
const TOTAL_FEES = 0.003;
const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.date)) === dayTimestamp)?.volume_total
  const fees = dailyVolume ? Number(dailyVolume) * TOTAL_FEES : undefined

  return {
    dailyVolume: dailyVolume,
    dailyFees: fees,
  };
};


const adapter: Adapter = {
  deadFrom: '2023-02-02',
  adapter: {
    [CHAIN.JUNO]: {
        fetch,
        start: '2022-03-09',
    },
  },
}

export default adapter;
