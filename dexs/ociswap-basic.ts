import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getOciswapXrdTotals } from "../helpers/ociswap";

const fetch = async (options: FetchOptions) => {
  const { volume } = await getOciswapXrdTotals('basic')
  const dailyVolume = options.createBalances()
  dailyVolume.addCGToken('radix', volume)
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.RADIXDLT]: {
      fetch,
      start: '2023-10-01',
      runAtCurrTime: true,
    }
  },
  methodology: {
    Volume: "Trailing 24h swap volume of Ociswap Basic pools from the Ociswap API, valued by the XRD side of each pool.",
  },
}
export default adapter;
