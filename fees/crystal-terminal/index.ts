import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getETHReceived } from "../../helpers/token"

const TREASURY_ADDRESS = "0x565e9c68fc827958551ede5757461959206ab0bd"
const ROUTER_ADDRESS = "0xc2d3689cf6ce2859a3ffbc8fe09ab4c8623766b8"

const fetch = async (options: FetchOptions) => {
  const balances = options.createBalances();
  await getETHReceived({
    options,
    balances,
    targets: [TREASURY_ADDRESS] // Treasury address
  });

  return { dailyFees: balances, dailyRevenue: balances };
}

const adapter: Adapter = {
  version: 2,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: "2025-11-24",
    },
  },
  methodology: {
    Fees: `MON inflows to ${TREASURY_ADDRESS} coming from router ${ROUTER_ADDRESS}.`,
    Revenue: "All such MON transfers are treated as protocol revenue.",
    ProtocolRevenue: "Equal to total MON routed from router to treasury.",
  },
}


export default adapter
