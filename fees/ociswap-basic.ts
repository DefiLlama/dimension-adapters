import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getOciswapXrdTotals } from "../helpers/ociswap";

const fetch = async (options: FetchOptions) => {
  const { fees } = await getOciswapXrdTotals('basic')
  const dailyFees = options.createBalances()
  dailyFees.addCGToken('radix', fees)
  return { dailyFees };
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
    Fees: "Trailing 24h swap fees of Ociswap Basic pools as reported by the Ociswap API, converted to XRD at each pool's own exchange rate.",
  },
}
export default adapter;
