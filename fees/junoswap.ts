import { Adapter, DISABLED_ADAPTER_KEY } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import fetchURL from "../utils/fetchURL";
import disabledAdapter from "../helpers/disabledAdapter";

const historicalVolumeEndpoint = "https://api-junoswap.enigma-validator.com/volumes/total/historical/12M/d"

interface IVolumeall {
  volume_total: string;
  date: string;
}
const TOTAL_FEES = 0.003;
const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  const totalVolume = historicalVolume
    .filter(volItem => getUniqStartOfTodayTimestamp(new Date(volItem.date)) <= dayTimestamp)
    .reduce((acc, { volume_total }) => acc + Number(volume_total), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.date)) === dayTimestamp)?.volume_total
  const totalFeesUsd = totalVolume * TOTAL_FEES;
  const dailyFeesUsd = dailyVolume ? Number(dailyVolume) * TOTAL_FEES : undefined
  return {
    totalFees: totalFeesUsd.toString(),
    dailyFees: dailyFeesUsd ? dailyFeesUsd.toString(): undefined,
    dailyVolume: dailyVolume ? dailyVolume.toString() : undefined,
    totalVolume: `${totalVolume}`,
    timestamp: dayTimestamp,
  };
};


const adapter: Adapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.JUNO]: {
        fetch: fetch,
        start: 1646784000,
    },
  }
}

export default adapter;
