import fetchURL from "../../utils/fetchURL"
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

//const historicalVolumeEndpoint = "https://api.swapline.com/api/v1/protocol-chartdata?aggregate=true"
const historicalVolumeEndpoint = "https://api-c.swapline.com/api/v1/protocol-chartdata?chainId=";

interface IVolumeall {
  volumeUSD: number;
  date: number;
}

const fetch = async ({ startOfDay,api, createBalances }: FetchOptions) => {
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
  // Both API hosts and the swapline.com apex resolve with no A record. All four chains read the
  // same two hosts, so none of them can report. Last published point 2024-06-03 ($18,388).
  deadFrom: '2024-06-04',
};

export default adapter;
