import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const address = '0xdfc7c877a950e49d2610114102175a06c2e3167a'
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const feesStart = await options.fromApi.call({target: address, abi: "uint:totalWagered"})
  const feesEnd = await options.toApi.call({target: address, abi: "uint:totalWagered"})
  dailyFees.add("0xDfc7C877a950e49D2610114102175A06C2e3167a", feesEnd-feesStart)
  dailyFees.resizeBy(1/100)
  return {dailyFees}
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
