import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const address = '0x79b4be7eD13Eef58Bd15ABd6ed79569f21D6c3AF'
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const feesStart = await options.fromApi.call({target: address, abi: "uint:totalWagered"})
  const feesEnd = await options.toApi.call({target: address, abi: "uint:totalWagered"})
  dailyFees.add("0xDfc7C877a950e49D2610114102175A06C2e3167a", feesEnd-feesStart)
  dailyFees.resizeBy(0.01)
  return {dailyFees, dailyRevenue: dailyFees}
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MODE]: {
      fetch: fetch,
      start: 0,
    }
  }
}

export default adapter;
