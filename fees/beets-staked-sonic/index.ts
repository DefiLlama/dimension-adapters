import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchV2, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const fetch: FetchV2 = async ({ getLogs, createBalances, }) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const logs = await getLogs({
    target: ADDRESSES.sonic.STS,
    eventAbi: 'event RewardsClaimed(uint256 amountClaimed, uint256 protocolFee)'
  })
  logs.map((e: any) => {
    dailyFees.addGasToken(e.amountClaimed, METRIC.STAKING_REWARDS)
    dailyRevenue.addGasToken(e.protocolFee, METRIC.PROTOCOL_FEES)
  })
  return { dailyFees, dailyRevenue, }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: 'Total staking rewards claimed by users from the Beets Staked Sonic protocol',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Protocol fee taken from staking rewards when users claim their rewards',
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2024-12-16',
    },
  },
  breakdownMethodology,
} as Adapter