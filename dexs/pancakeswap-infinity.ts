import * as sdk from "@defillama/sdk";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getDefaultDexTokensBlacklisted } from "../helpers/lists"
import { addOneToken } from "../helpers/prices"

const METRIC = {
  SWAP_FEES: 'Token Swap Fees',
  PROTOCOL_REVENUE: 'Swap Fees To Protocol',
  HOLDERS_REVENUE: 'Swap Fees To Holders',
  LP_REVENUE: 'Swap Fees To Liquidity Providers',
  BUY_BACK_AND_BURN: 'Buy Back And Burn CAKE',
}

// https://developer.pancakeswap.finance/contracts/infinity/resources/addresses
const config: any = {
  [CHAIN.BSC]: { clPoolManager: '0xa0ffb9c1ce1fe56963b0321b32e7a0302114058b', fromBlock: 47214308, start: '2025-03-06', blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.BSC) },
  [CHAIN.BASE]: { clPoolManager: '0xa0ffb9c1ce1fe56963b0321b32e7a0302114058b', fromBlock: 30544106, start: '2025-05-23' },
}
const adapter: SimpleAdapter = {
  // pullHourly: true,
  version: 2,
  adapter: {},
  methodology: {
    Fees: 'Total swap fees paid by users.',
    Revenue: 'Share of swap fees to protocol and holders.',
    ProtocolRevenue: '50% of revenue are collected by protocol.',
    SupplySideRevenue: 'Share of swap fees to LPs.',
    HoldersRevenue: '50% of revenue are used to buy back and burn CAKE',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Total swap fees paid by users.',
    },
    Revenue: {
      [METRIC.PROTOCOL_REVENUE]: 'Share of swap fees to protocol.',
      [METRIC.HOLDERS_REVENUE]: '50% of revenue are collected by protocol.',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_REVENUE]: '50% of revenue are collected by protocol.',
    },
    SupplySideRevenue: {
      [METRIC.LP_REVENUE]: 'Share of swap fees to LPs.',
    },
    HoldersRevenue: {
      [METRIC.BUY_BACK_AND_BURN]: '50% of revenue will be used to buy back and burn CAKE',
    },
  }
}

async function fetch({ getLogs, createBalances, chain, fromApi, toApi }: FetchOptions) {
  const { clPoolManager, fromBlock, blacklistTokens } = config[chain]
  const getFromBlock = Number(fromApi.block)
  const getToBlock = Number(toApi.block)
  const dailyVolume = createBalances()
  const swapFees = createBalances()
  const revenue = createBalances()

  const logs = await getLogs({
    target: clPoolManager,
    fromBlock,
    cacheInCloud: true,
    eventAbi: 'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint160 sqrtPriceX96, int24 tick)',
  })

  const poolMap: Record<string, { currency0: string, currency1: string }> = {}
  logs.forEach((log: any) => {
    const { id, currency0, currency1 } = log
    poolMap[id.toLowerCase()] = { currency0, currency1 }
  })

  const BigIntE6 = BigInt(1e6)

  await sdk.indexer.getLogs({
    chain,
    target: clPoolManager,
    eventAbi: 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint16 protocolFee)',
    fromBlock: getFromBlock,
    toBlock: getToBlock,
    onlyArgs: true,
    all: true,
    collect: false,
    clientStreaming: true,
    processor: (chunk: any | any[]) => {
      const swapLogs = Array.isArray(chunk) ? chunk : [chunk]

      swapLogs.forEach((log: any) => {
        const { id, amount0, amount1, protocolFee, fee } = log
        const pool = poolMap[id.toLowerCase()]
        if (!pool) return

        const { currency0, currency1 } = pool

        if (
          blacklistTokens &&
          (blacklistTokens.includes(currency0.toLowerCase()) ||
           blacklistTokens.includes(currency1.toLowerCase()))
        ) {
          return
        }

        const amoun0Fees = (amount0 * BigInt(fee)) / BigIntE6
        const amoun1Fees = (amount1 * BigInt(fee)) / BigIntE6
        const amount0ProtocolFees = (amount0 * BigInt(protocolFee)) / BigIntE6
        const amount1ProtocolFees = (amount1 * BigInt(protocolFee)) / BigIntE6

        addOneToken({ chain, balances: dailyVolume, token0: currency0, amount0, token1: currency1, amount1 })
        addOneToken({ chain, balances: swapFees, token0: currency0, amount0: amoun0Fees, token1: currency1, amount1: amoun1Fees })
        addOneToken({ chain, balances: revenue, token0: currency0, amount0: amount0ProtocolFees, token1: currency1, amount1: amount1ProtocolFees })
      })
    },
  })

  const dailyFees = swapFees.clone(1, METRIC.SWAP_FEES);
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  const lpRevenue = swapFees.clone(1);
  lpRevenue.subtract(revenue);
  dailySupplySideRevenue.add(lpRevenue, METRIC.LP_REVENUE);

  // https://docs.pancakeswap.finance/trade/pancakeswap-infinity/pool-types/infinity-clamm-and-lbamm
  // 50% to protocol, 50% to burn CAKE
  dailyRevenue.add(revenue.clone(0.5), METRIC.PROTOCOL_REVENUE);
  dailyRevenue.add(revenue.clone(0.5), METRIC.HOLDERS_REVENUE);

  const dailyProtocolRevenue = revenue.clone(0.5, METRIC.PROTOCOL_REVENUE);
  const dailyHoldersRevenue = revenue.clone(0.5, METRIC.BUY_BACK_AND_BURN);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  }
}

Object.keys(config).forEach(chain => {
  const { start } = config[chain];
  (adapter.adapter as BaseAdapter)[chain] = { fetch, start }
})

export default adapter
