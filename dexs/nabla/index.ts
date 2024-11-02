import { Adapter, FetchV2, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

export default {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: (async ({ getLogs, createBalances, }) => {
        const dailyFees = createBalances()
        const dailyRevenue = createBalances()
        const logs = await getLogs({
            target: "0x272dF896f4D0c97F65e787f861bb6e882776a155",
            eventAbi: 'event ChargedSwapFees(uint256 lpFees, uint256 backstopFees, uint256 protocolFees)'
        })
        logs.map((e: any) => {
            dailyFees.add("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", e.lpFees+e.backstopFees+e.protocolFees) 
            dailyRevenue.add("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", e.protocolFees) 
        })
        return { dailyFees, dailyRevenue, }
      }) as FetchV2,
      start: 1723690984,
    },
  },
  version: 2,
} as Adapter