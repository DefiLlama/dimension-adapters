import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
const sdk = require('@defillama/sdk')

const fetch = async (timestamp: number, _1: any, { api, createBalances, }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const LRON = ADDRESSES.ronin.LRON
  const period = Math.floor(timestamp / 86400)


  // need to sdk as we dont have archive node for ronin
  const loggedFees = await sdk.api2.abi.call({ target: LRON, abi: "function loggedFees(uint256) view returns (uint256)", params: period, chain: CHAIN.RONIN })
  const rewardsClaimed = await sdk.api2.abi.call({ target: LRON, abi: "function rewardsClaimed(uint256) view returns (uint256)", params: period, chain: CHAIN.RONIN })

  dailyFees.addGasToken(loggedFees)
  dailyFees.addGasToken(rewardsClaimed)
  dailyRevenue.addGasToken(rewardsClaimed * 0.065)

  return { timestamp, dailyFees, dailyRevenue }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.RONIN]: {
      fetch,
      start: '2025-04-09',
    },
  },
  methodology: {
    Fees: "Deposit fee and staking rewards.",
    Revenue: "Liquid RON takes 6.5% performance fee whenever staking rewards are claimed.",
  }
}

export default adapter