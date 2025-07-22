import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


const historicalVolumeEndpoint = "https://api.synthetify.io/stats/mainnet"

interface IVolumeall {
  volume: number;
  timestamp: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  const totalVolume = historicalVolume
    .filter(volItem => volItem.timestamp <= dayTimestamp)
    .reduce((acc, { volume }) => acc + Number(volume), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.timestamp * 1000)) === dayTimestamp)?.volume

  return {
    totalVolume: totalVolume,
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
    },
  },
};

export default adapter;
