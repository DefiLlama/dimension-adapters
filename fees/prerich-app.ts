import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '2F6oCWmo44sxTzg228GkqKhwuhFTrUNTPCnSFBsyLZeg' })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: '2023-06-01',
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
}

export default adapter;
