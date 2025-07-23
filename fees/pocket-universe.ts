import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import {routers} from "./kerberos/routers"

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options, targets: [
      '0x77777D91c0B8Ec9984a05302E4Ef041dcCf77FeE',
      '0xc8c0e780960f954c3426a32b6ab453248d632b59'
    ], fromAdddesses: routers
  })

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
};

const meta = {
  methodology: {
    Fees: "All fess paid by users while use extension.",
    Revenue: "All fess paid by users while use extension.",
    ProtocolRevenue: "All fess paid by users while use extension.",
  }
}

const start = 1712710800
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start, meta },
    [CHAIN.BASE]: { fetch, start, meta },
    [CHAIN.ARBITRUM]: { fetch, start, meta },
    [CHAIN.POLYGON]: { fetch, start, meta },
    [CHAIN.BSC]: { fetch, start, meta },
    [CHAIN.OPTIMISM]: { fetch, start, meta },
  },
};
export default adapter;
