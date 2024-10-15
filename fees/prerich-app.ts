import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fethcFeesSolana = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '2F6oCWmo44sxTzg228GkqKhwuhFTrUNTPCnSFBsyLZeg' })
  return { dailyFees, dailyRevenue: dailyFees, }
}


const adapter: SimpleAdapter = {
  version: 2,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: 1685577600,
    },
  }
}

export default adapter;
