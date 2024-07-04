import { Chain } from "@defillama/sdk/build/general";
import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import disabledAdapter from "../../helpers/disabledAdapter";
import { httpGet } from "../../utils/fetchURL";

const historicalVolumeEndpoint = "https://api.viewblock.io/dex/unicly"

interface IVolumeall {
  value: number;
  timestamp: number;
}
const headers = {
  "origin": "https://dex.viewblock.io"
}
const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await httpGet(historicalVolumeEndpoint, { headers })).charts.volume;
  const totalVolume = historicalVolume
    .filter(volItem => Math.floor(Number(volItem.timestamp) / 1000) <= dayTimestamp)
    .reduce((acc, { value }) => acc + Number(value), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => Math.floor(Number(dayItem.timestamp) / 1000) === dayTimestamp)?.value

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = (await httpGet(historicalVolumeEndpoint, { headers })).charts.volume;
  return (new Date(historicalVolume[0].timestamp).getTime()) / 1000
}

const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.ETHEREUM]: {
      fetch,
      start: getStartTimestamp,
      customBackfill: customBackfill(CHAIN.ETHEREUM as Chain, (_chian: string) => fetch)
    },
  },
};

export default adapter;
