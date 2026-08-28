import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
const sdk = require('@defillama/sdk')

const fetch = async ({ api, createBalances, toTimestamp }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const LRON = ADDRESSES.ronin.LRON
  const period = Math.floor(toTimestamp / 86400)


  // need to sdk as we dont have archive node for ronin
  const loggedFees = await sdk.api2.abi.call({ target: LRON, abi: "function loggedFees(uint256) view returns (uint256)", params: period, chain: CHAIN.RONIN })
  const rewardsClaimed = await sdk.api2.abi.call({ target: LRON, abi: "function rewardsClaimed(uint256) view returns (uint256)", params: period, chain: CHAIN.RONIN })

  dailyFees.addGasToken(loggedFees)
  dailyFees.addGasToken(rewardsClaimed)
  dailyRevenue.addGasToken(rewardsClaimed * 0.065)

  return { dailyFees, dailyRevenue }
}

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.RONIN],
  start: '2025-04-09',
  methodology: {
    Fees: "Deposit fee and staking rewards.",
    Revenue: "Liquid RON takes 6.5% performance fee whenever staking rewards are claimed.",
  }
}

export default adapter