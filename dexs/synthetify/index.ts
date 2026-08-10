import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


const historicalVolumeEndpoint = "https://api.synthetify.io/stats/mainnet"

interface IVolumeall {
  volume: number;
  timestamp: number;
}

const fetch = async (options: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.timestamp * 1000)) === options.startOfDay)?.volume

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
};

export default adapter;
