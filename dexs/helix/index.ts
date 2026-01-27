import { BreakdownAdapter, ChainBlocks, FetchOptions, FetchResultVolume } from "../../adapters/types";
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
const fetchDerivative = async (_a: any): Promise<FetchResultVolume> => {
  const volume: IVolume[] = (await fetchURL(URL_Derivative));
  const dailyVolume = volume.reduce((e: number, a: IVolume) => a.target_volume + e, 0);
  const openInterestAtEnd = volume.reduce((e: number, a: IVolume) => a.open_interest + e, 0);

  return {
    dailyVolume,
    openInterestAtEnd,
  }
}

const adapter: BreakdownAdapter = {
  breakdown: {
    "helix": {
      [CHAIN.INJECTIVE]: {
        fetch,
        runAtCurrTime: true,
        start: '2023-02-16',
      }
    },
    "helix-perp": {
      [CHAIN.INJECTIVE]: {
        fetch: fetchDerivative,
        runAtCurrTime: true,
        start: '2024-01-27',
      }
    }
  }
}
export default adapter;
