import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://ocean.defichain.com/v0/mainnet/poolpairs?size=1000"

interface IData {
  volume: IVolume;
}
interface IVolume {
  h24: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IData[] = (await fetchURL(historicalVolumeEndpoint))?.data;
  const dailyVolume = historicalVolume
    .reduce((acc, { volume }) => acc + Number(volume.h24), 0)


  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.DEFICHAIN]: {
      fetch,
            runAtCurrTime: true
    },
  },
};

export default adapter;
