import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

// https://github.com/ethereum-optimism/op-analytics/blob/main/op_collective_economics/opcollective_feesplit/inputs/op_collective_feesplit_config.csv
const fees: any = {
  [CHAIN.BASE]: ['0x9c3631dDE5c8316bE5B7554B0CcD2631C15a9A05'],
  [CHAIN.ETHEREUM]: [
    '0xa3d596eafab6b13ab18d40fae1a962700c84adea',
    '0xC2eC5Dd60CBD5242b8cdeB9d0d37Ff6024584631',
  ]
}

const fetchFees = async (_: any, _1: any, options: FetchOptions) => {
  const logs = await options.getLogs({
    targets: fees[options.chain],
    eventAbi: 'event SafeReceived (address indexed sender, uint256 value)',
  })
  const logs2 = await options.getLogs({
    targets: fees[options.chain],
    eventAbi: 'event Deposited (address from, uint256 value, bytes data)',
  })
  const dailyFees = options.createBalances()
  for (const log of logs) dailyFees.addGasToken(log.value)
  for (const log of logs2) dailyFees.addGasToken(log.value)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
    },
  }
}

export default adapter
