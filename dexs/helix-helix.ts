import { SimpleAdapter, ChainBlocks, FetchOptions, FetchResultVolume } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL"

const URL = "https://external.api.injective.network/api/aggregator/v1/spot/tickers";
interface IVolume {
  target_volume: number;
  open_interest: number;
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances }: FetchOptions): Promise<FetchResultVolume> => {
  const volume: IVolume[] = (await fetchURL(URL));
  const dailyVolume = volume.reduce((e: number, a: IVolume) => a.target_volume + e, 0);
  const dailyVolumeBN = createBalances();
  dailyVolumeBN.addCGToken('tether', dailyVolume);
  return {
    dailyVolume: dailyVolumeBN,
    timestamp
  }
}

const adapter: SimpleAdapter = {
  doublecounted: true,
  adapter: {
    [CHAIN.INJECTIVE]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-02-16',
    }
  }
}
export default adapter;
