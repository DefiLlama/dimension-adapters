import fetchURL from "../../utils/fetchURL"
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

//const historicalVolumeEndpoint = "https://api.swapline.com/api/v1/protocol-chartdata?aggregate=true"
const historicalVolumeEndpoint = "https://api-c.swapline.com/api/v1/protocol-chartdata?chainId=";

interface IVolumeall {
  volumeUSD: number;
  date: number;
}

const fetch = async (_timestamp: number , _: ChainBlocks, { startOfDay,api, createBalances }: FetchOptions) => {
  const dayTimestamp = startOfDay
  const dailyVolume = createBalances();
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint + api.getChainId()))[0]?.chainEntries;
  const dailyVolumes = historicalVolume
    .find(dayItem => dayItem.date === dayTimestamp)?.volumeUSD
  dailyVolume.addCGToken('tether', dailyVolumes)

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  }
}

const fetchObject = { fetch, start: '2023-03-29' }

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: fetchObject,
    [CHAIN.OPTIMISM]: fetchObject,
    [CHAIN.ARBITRUM]: fetchObject,
    [CHAIN.SHIMMER_EVM]: fetchObject,
  },
};

export default adapter;
