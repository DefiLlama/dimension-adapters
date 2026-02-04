import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const address = '0xeb5D5af6a0ac3B64243858094d6b3b379B8772Aa'
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const feesStart = await options.fromApi.call({ target: address, abi: "uint:GGR" })
  const feesEnd = await options.toApi.call({ target: address, abi: "uint:GGR" })
  dailyFees.add(ADDRESSES.mode.USDC, feesEnd - feesStart, "Betmode protocol fees")
  dailyFees.resizeBy(0.065)
  return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MODE]: {
      fetch: fetch,
    }
  },
  breakdownMethodology: {
    Fees: {
      "Betmode protocol fees": "Gross gaming revenue collected on the Betmode protocol in USDC",
    },
    Revenue: {
      "Betmode protocol fees": "Gross gaming revenue collected on the Betmode protocol in USDC",
    },
  }
}

export default adapter;
