import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchV2, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

export default {
  adapter: {
    [CHAIN.SONIC]: {
      fetch: (async ({ getLogs, createBalances, }) => {
        const dailyFees = createBalances()
        const dailyRevenue = createBalances()
        const logs = await getLogs({
            target: ADDRESSES.sonic.STS,
            eventAbi: 'event RewardsClaimed(uint256 amountClaimed, uint256 protocolFee)'
        })
        logs.map((e: any) => {
            dailyFees.addGasToken(e.amountClaimed)
            dailyRevenue.addGasToken(e.protocolFee)
        })
        return { dailyFees, dailyRevenue, }
      }) as FetchV2,
      start: '2024-12-16',
    },
  },
  version: 2,
  pullHourly: true,
} as Adapter