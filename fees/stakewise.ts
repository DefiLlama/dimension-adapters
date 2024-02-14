import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const reth2Address = '0x20bc832ca081b91433ff6c17f85701b6e92486c5';
const osTokenCtrlAddress = '0x2A261e60FB14586B474C208b1B7AC6D0f5000306';
const fetchFees = async (timestamp: number , _: ChainBlocks, { createBalances, getLogs, }: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  // fetch rETH2 logs
  let logs= await getLogs({
    target: reth2Address,
    eventAbi: 'event RewardsUpdated(uint256 periodRewards,uint256 totalRewards,uint256 rewardPerToken,uint256 distributorReward,uint256 protocolReward)'
  })
  const rEth2Rewards = logs.map((log: any) => {
    return Number(log.periodRewards)
  }).reduce((a: number, b: number) => a + b, 0);

  // fetch osETH logs
  logs = await getLogs({
    target: osTokenCtrlAddress,
    eventAbi: 'event StateUpdated(uint256 profitAccrued,uint256 treasuryShares,uint256 treasuryAssets)'
  })
  const osEthRewards = logs.map((log: any) => {
    return Number(log.profitAccrued)
  }).reduce((a: number, b: number) => a + b, 0);

  dailyFees.addGasToken(osEthRewards + rEth2Rewards)
  dailyRevenue.addGasToken((osEthRewards * 0.05) + (rEth2Rewards * 0.1))
  dailySupplySideRevenue.addGasToken((osEthRewards * 0.95) + (rEth2Rewards * 0.9))
  return { dailyFees, dailyRevenue, dailySupplySideRevenue, timestamp }

}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: 1641254400
    }
  }
}

export default adapter;
