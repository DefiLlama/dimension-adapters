import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  return { dailyFees: await getSolanaReceived({ options, target: '97VmzkjX9w8gMFS2RnHTSjtMEDbifGXBq9pgosFdFnM' }) }

}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
          },
  },
  isExpensiveAdapter: true
};

export default adapter;
