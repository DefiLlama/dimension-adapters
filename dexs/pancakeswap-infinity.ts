import { BaseAdapter, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addOneToken } from "../helpers/prices"

// https://developer.pancakeswap.finance/contracts/infinity/resources/addresses
const config: any = {
  // [CHAIN.BSC]: { clPoolManager: '0xa0ffb9c1ce1fe56963b0321b32e7a0302114058b', fromBlock: 47214308, start: '2025-03-06', blacklistTokens: ['0xde04da55b74435d7b9f2c5c62d9f1b53929b09aa', '0xe6df05ce8c8301223373cf5b969afcb1498c5528'] },
  [CHAIN.BASE]: { clPoolManager: '0xa0ffb9c1ce1fe56963b0321b32e7a0302114058b', fromBlock: 30544106, start: '2025-05-23' },
}
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {}
}

async function fetch({ getLogs, createBalances, chain }: FetchOptions) {
  const { clPoolManager, fromBlock, blacklistTokens } = config[chain]
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const logs = await getLogs({
    target: clPoolManager,
    fromBlock,
    skipIndexer: true,
    eventAbi: 'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint160 sqrtPriceX96, int24 tick)',
  })

  const swapLogs = await getLogs({
    target: clPoolManager,
    eventAbi: "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint16 protocolFee)",
  })
  const poolMap: any = {}
  logs.forEach((log: any) => {
    const { id, currency0, currency1 } = log
    poolMap[id.toLowerCase()] = {
      currency0,
      currency1,
    }
  })
  const BigIntE6 = BigInt(1e6)
  swapLogs.forEach((log: any) => {
    const { id, amount0, amount1, protocolFee, fee } = log
    const pool = poolMap[id.toLowerCase()]
    if (!pool) {
      return;
    }
    const { currency0, currency1 } = pool

    if (blacklistTokens && (blacklistTokens.includes(currency0.toLowerCase()) || blacklistTokens.includes(currency1.toLowerCase()))) {
      return;
    }

    const amoun0Fees = (amount0 * BigInt(fee)) / BigIntE6
    const amoun1Fees = (amount1 * BigInt(fee)) / BigIntE6
    const amount0ProtocolFees = (amount0 * BigInt(protocolFee)) / BigIntE6
    const amount1ProtocolFees = (amount1 * BigInt(protocolFee)) / BigIntE6
    addOneToken({ chain, balances: dailyVolume, token0: currency0, amount0: amount0, token1: currency1, amount1: amount1 })
    addOneToken({ chain, balances: dailyFees, token0: currency0, amount0: amoun0Fees, token1: currency1, amount1: amoun1Fees })
    addOneToken({ chain, balances: dailyRevenue, token0: currency0, amount0: amount0ProtocolFees, token1: currency1, amount1: amount1ProtocolFees })
  })
  return { dailyVolume, dailyFees, dailyRevenue }
}

Object.keys(config).forEach(chain => {
  const { start } = config[chain];
  (adapter.adapter as BaseAdapter)[chain] = { fetch, start, }
})
export default adapter
