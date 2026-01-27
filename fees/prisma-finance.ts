import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const fetch = async (_t: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = await addTokensReceived({
    options,
    target: '0xfdce0267803c6a0d209d3721d2f01fd618e9cbf8',
  })
  return { dailyFees }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2023-08-31',
    }
  }
}
export default adapter;
