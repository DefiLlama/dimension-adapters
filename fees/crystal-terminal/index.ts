import { Adapter, Dependencies, FetchOptions, FetchResultV2 } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getETHReceived } from "../../helpers/token"

const TREASURY_ADDRESS = "0x565e9c68fc827958551ede5757461959206ab0bd"
const ROUTER_ADDRESS = "0xc2d3689cf6ce2859a3ffbc8fe09ab4c8623766b8"

const fetch = async (_a:any, _b:any, options: FetchOptions) => {

  const dailyFees = await getETHReceived({
    options,
    targets: [TREASURY_ADDRESS] // Treasury address
  });

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.MONAD],
  start: "2025-11-24",
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: `Trading Fees paid by users.`,
    UserFees: `Trading Fees paid by users.`,
    Revenue: "All such MON transfers are treated as protocol revenue.",
    ProtocolRevenue: "Equal to total MON routed from router to treasury.",
  },
}

export default adapter
