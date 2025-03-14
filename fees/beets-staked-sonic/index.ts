import { Adapter, FetchV2, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

export default {
  adapter: {
    [CHAIN.SONIC]: {
      fetch: (async ({ getLogs, createBalances, }) => {
        const dailyFees = createBalances()
        const dailyRevenue = createBalances()
        const logs = await getLogs({
            target: "0xe5da20f15420ad15de0fa650600afc998bbe3955",
            eventAbi: 'event RewardsClaimed(uint256 amountClaimed, uint256 protocolFee);'
        })
        logs.map((e: any) => {
            dailyFees.addGasToken(e.amountClaimed)
            dailyRevenue.addGasToken(e.protocolFee)
        })
        return { dailyFees, dailyRevenue, }
      }) as FetchV2,
      start: 454495,
    },
  },
  version: 2,
} as Adapter