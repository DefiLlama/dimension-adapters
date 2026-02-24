import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from '../helpers/token';

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    tokens: ["0x000000000000000000000000000000000000800A"], targets: ["0x3F037C50Db52087F52c89DE91E59e612350B4740"],
    fromAdddesses: ["0x722122A1940B5c20Ac55e524b6ED7a2AA5172b87"], skipIndexer: true
  })

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ABSTRACT]: {
      fetch: fetch,
    },
  },
  methodology: {
    Fees: "Tokens trading and launching fees paid by users.",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All revenue collected by protocol.",
  }
};

export default adapter;