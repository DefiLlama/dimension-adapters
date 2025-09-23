import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const fees = await getSolanaReceived({ options, targets: ['h7HnoyxPxBW25UaG6ayo4jSSmFARX9DmpYhbNZsLfiP'] })
  return { dailyFees: fees, dailyRevenue: fees, dailyProtocolRevenue: fees, dailyUserFees: fees }
}

const methodology = {
  Fees: "Platform fees is 3.75% of total liquidity migrated.",
  UserFees: "Platform fees is 3.75% of total liquidity migrated.",
  Revenue: "3.75% of total liquidity migrated.",
  ProtocolRevenue: "3.75% of total liquidity migrated.",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: '2025-09-19',
  chains: [CHAIN.SOLANA],
  methodology
}

export default adapter
