import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '2F6oCWmo44sxTzg228GkqKhwuhFTrUNTPCnSFBsyLZeg' })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: '2023-06-01',
  chains: [CHAIN.SOLANA],
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
}

export default adapter;
