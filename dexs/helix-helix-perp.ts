import { SimpleAdapter, FetchResultVolume } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL"

const URL_Derivative = "https://external.api.injective.network/api/aggregator/v1/derivative/contracts";
interface IVolume {
  target_volume: number;
  open_interest: number;
}

const fetchDerivative = async (_a: any): Promise<FetchResultVolume> => {
  const volume: IVolume[] = (await fetchURL(URL_Derivative));
  const dailyVolume = volume.reduce((e: number, a: IVolume) => a.target_volume + e, 0);
  const openInterestAtEnd = volume.reduce((e: number, a: IVolume) => a.open_interest + e, 0);

  return {
    dailyVolume,
    openInterestAtEnd,
  }
}

const adapter: SimpleAdapter = {
  doublecounted: true,
  adapter: {
    [CHAIN.INJECTIVE]: {
      fetch: fetchDerivative,
      runAtCurrTime: true,
      start: '2024-01-27',
    }
  }
}
export default adapter;
