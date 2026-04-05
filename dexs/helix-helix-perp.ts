import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { tickerToCgId } from "../helpers/coingeckoIds";
import fetchURL from "../utils/fetchURL"

const URL_Derivative = "https://external.api.injective.network/api/aggregator/v1/derivative/contracts";
interface IVolume {
  target_volume: number;
  open_interest: number;
  base_currency: string;
  base_volume: number;
}
const fetchDerivative = async (_a: any, _b: any, options: FetchOptions) => {
  const volume: IVolume[] = (await fetchURL(URL_Derivative));
  const dailyVolume = options.createBalances();
  const openInterestAtEnd = volume.reduce((e: number, a: IVolume) => a.open_interest + e, 0);

  for (const item of volume) {
    const cgId = tickerToCgId[item.base_currency];
    if (cgId) {
      dailyVolume.addCGToken(cgId, item.base_volume);
    } else {
      dailyVolume.addUSDValue(item.target_volume);
    }
  }

  return { dailyVolume, openInterestAtEnd };
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
