import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fethcFeesSolana = async (_: any, _1: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '2F6oCWmo44sxTzg228GkqKhwuhFTrUNTPCnSFBsyLZeg' })
  return { dailyFees, dailyRevenue: dailyFees, }
}


const adapter: SimpleAdapter = {
  version: 1,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: '2023-06-01',
    },
  }
}

export default adapter;
