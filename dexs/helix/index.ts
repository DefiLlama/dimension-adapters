import { BreakdownAdapter, ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL"

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

const URL_Derivative = "https://external.api.injective.network/api/aggregator/v1/derivative/contracts";
const fetchDerivative = async (timestamp: number): Promise<FetchResultVolume> => {
  const volume: IVolume[] = (await fetchURL(URL_Derivative));
  const dailyVolume = volume.reduce((e: number, a: IVolume) => a.target_volume + e, 0);
  const dailyOpenInterest = volume.reduce((e: number, a: IVolume) => a.open_interest + e, 0);

  return {
    dailyVolume: dailyVolume.toString(),
    dailyOpenInterest: dailyOpenInterest.toString(),
    timestamp
  }
}

const adapter: BreakdownAdapter = {
  breakdown: {
    "helix": {
      [CHAIN.INJECTIVE]: {
        fetch: fetch,
        start: 1676505600,
      }
    },
    "helix-perp": {
      [CHAIN.INJECTIVE]: {
        fetch: fetchDerivative,
        start: 1706313600,
      }
    }
  }
}
export default adapter;
