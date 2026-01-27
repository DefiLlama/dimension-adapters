import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const reth2Address = '0x20bc832ca081b91433ff6c17f85701b6e92486c5';
const osTokenCtrlAddress = '0x2A261e60FB14586B474C208b1B7AC6D0f5000306';

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // fetch rETH2 logs
  let logs = await options.getLogs({
    target: reth2Address,
    eventAbi: 'event RewardsUpdated(uint256 periodRewards,uint256 totalRewards,uint256 rewardPerToken,uint256 distributorReward,uint256 protocolReward)'
  })
  const rEth2Rewards = logs.map((log: any) => {
    return Number(log.periodRewards)
  }).reduce((a: number, b: number) => a + b, 0);

  // fetch osETH logs
  logs = await options.getLogs({
    target: osTokenCtrlAddress,
    eventAbi: 'event StateUpdated(uint256 profitAccrued,uint256 treasuryShares,uint256 treasuryAssets)'
  })
  const osEthRewards = logs.map((log: any) => {
    return Number(log.profitAccrued)
  }).reduce((a: number, b: number) => a + b, 0);

  dailyFees.addGasToken(osEthRewards + rEth2Rewards)
  dailyRevenue.addGasToken((osEthRewards * 0.05) + (rEth2Rewards * 0.1))
  dailySupplySideRevenue.addGasToken((osEthRewards * 0.95) + (rEth2Rewards * 0.9))

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Total staking rewards collected from vaults, rETH and osETH.',
    Revenue: 'There are 5% staking rewards on osETH and 10% on rETH.',
    ProtocolRevenue: 'There are 5% staking rewards on osETH and 10% on rETH.',
    SupplySideRevenue: 'Stakers earn 95% staking rewards on osETH and 90% on rETH.',
    HoldersRevenue: 'No revenue share to SWISE token holders.',
  },
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-01-04'
    }
  }
}

export default adapter;
