import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch = async (options: FetchOptions) => {
  const fees = await getSolanaReceived({ options, targets: ['h7HnoyxPxBW25UaG6ayo4jSSmFARX9DmpYhbNZsLfiP'] })
  return { dailyFees: fees, dailyRevenue: fees, dailyProtocolRevenue: fees }
}

const methodology = {
  Fees: "Fees collected by the migrate.fun bot.",
  Revenue: "Revenue collected by the migrate.fun bot.",
  ProtocolRevenue: "Protocol revenue collected by the migrate.fun bot.",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: '2025-09-19',
  chains: [CHAIN.SOLANA],
  methodology
}

export default adapter
