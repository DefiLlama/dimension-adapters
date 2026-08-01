import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";import { CHAIN } from "../../helpers/chains"
import fetchURL from "../../utils/fetchURL"

interface AstrolescentStats {
  volumeUSD:	number;
}
const fetchVolume = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const response: AstrolescentStats = (await fetchURL(`https://api.astrolescent.com/stats/history?timestamp=${options.toTimestamp}`));
  const dailyVolume = Number(response?.volumeUSD);

  return {
    dailyVolume,}
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.RADIXDLT]: {
      fetch: fetchVolume,
      start: '2023-10-30',
    }
  }
}
export default adapters;
