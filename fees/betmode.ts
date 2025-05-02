import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const address = '0xeb5D5af6a0ac3B64243858094d6b3b379B8772Aa'
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const feesStart = await options.fromApi.call({ target: address, abi: "uint:GGR" })
  const feesEnd = await options.toApi.call({ target: address, abi: "uint:GGR" })
  dailyFees.add("0xd988097fb8612cc24eeC14542bC03424c656005f", feesEnd - feesStart)
  dailyFees.resizeBy(0.065)
  return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MODE]: {
      fetch: fetch,
          }
  }
}

export default adapter;
