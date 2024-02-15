import fetchURL from "../../utils/fetchURL"
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

//const historicalVolumeEndpoint = "https://api.swapline.com/api/v1/protocol-chartdata?aggregate=true"
const historicalVolumeEndpoint = "https://api-c.swapline.com/api/v1/protocol-chartdata?chainId=";

interface IVolumeall {
  volumeUSD: number;
  date: number;
}

const fetch = async (_timestamp: number , _: ChainBlocks, { startOfDay,api }: FetchOptions) => {
  const dayTimestamp = startOfDay
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint + api.getChainId()))[0]?.chainEntries;
  const totalVolume = historicalVolume
    .filter(volItem => volItem.date <= dayTimestamp)
    .reduce((acc, { volumeUSD }) => acc + Number(volumeUSD), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.date === dayTimestamp)?.volumeUSD

  return {
    totalVolume: totalVolume,
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  }
}

const fetchObject = { fetch, start:1680048000 }

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: fetchObject,
    [CHAIN.OPTIMISM]: fetchObject,
    [CHAIN.ARBITRUM]: fetchObject,
    [CHAIN.SHIMMER_EVM]: fetchObject,
  },
};

export default adapter;
