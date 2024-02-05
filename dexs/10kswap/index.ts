import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.10kswap.com/analytics"

interface IVolumeall {
  volume: string;
  date: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.volumes;
  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.date).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { volume }) => acc + Number(volume), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.volume

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch,
      start: 1663545600
    },
  },
};

export default adapter;
