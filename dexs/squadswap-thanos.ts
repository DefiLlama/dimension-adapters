import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getDefaultDexTokensBlacklisted } from "../helpers/lists"
import { addOneToken } from "../helpers/prices"

const METRIC = {
  SWAP_FEES: 'Token Swap Fees',
  PROTOCOL_REVENUE: 'Swap Fees To Protocol',
  LP_REVENUE: 'Swap Fees To Liquidity Providers',
}

// SquadSwap Thanos is SquadSwap's v4, both CLAMM (CLPoolManager) and LBAMM (BinPoolManager) launched together.
const config: any = {
  [CHAIN.BSC]: { clPoolManager: '0x9d3b119eff69cd81d324f654062b6ffa3dd7f405', binPoolManager: '0xd7a5a9df1719ee83a4d10749019caabf137debac', fromBlock: 74380131, start: '2026-01-07', blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.BSC) },
  [CHAIN.BASE]: { clPoolManager: '0xbb07a7bdfc50829ce932adccc0498f0e29f49f50', binPoolManager: '0xd243e0c2fc2a91eace239e0c54023559a47c5f04', fromBlock: 40500004, start: '2026-01-07', blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.BASE) },
}

const adapter: SimpleAdapter = {
  pullHourly: true,
  version: 2,
  adapter: config,
  fetch,
  methodology: {
    Fees: 'Total swap fees paid by users.',
    Revenue: 'Share of swap fees collected by the protocol.',
    ProtocolRevenue: 'Share of swap fees collected by the protocol.',
    SupplySideRevenue: 'Share of swap fees to LPs.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Total swap fees paid by users.',
    },
    Revenue: {
      [METRIC.PROTOCOL_REVENUE]: 'Share of swap fees collected by the protocol.',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_REVENUE]: 'Share of swap fees collected by the protocol.',
    },
    SupplySideRevenue: {
      [METRIC.LP_REVENUE]: 'Share of swap fees to LPs.',
    },
  }
}

// CLPoolManager and BinPoolManager share the same Swap semantics (id, amount0, amount1, fee, protocolFee,
// both denominated in hundredths of a bip) — only the Initialize/Swap ABI differs (sqrtPriceX96+tick vs activeId).
async function trackPoolManager({ getLogs, chain, target, fromBlock, initializeAbi, swapAbi, blacklistTokens, dailyVolume, swapFees, revenue }: {
  getLogs: FetchOptions['getLogs'], chain: string, target: string, fromBlock: number,
  initializeAbi: string, swapAbi: string, blacklistTokens?: string[],
  dailyVolume: ReturnType<FetchOptions['createBalances']>, swapFees: ReturnType<FetchOptions['createBalances']>, revenue: ReturnType<FetchOptions['createBalances']>,
}) {
  const initializeLogs = await getLogs({
    target,
    fromBlock,
    cacheInCloud: true,
    eventAbi: initializeAbi,
  })

  const poolMap: Record<string, { currency0: string, currency1: string }> = {}
  initializeLogs.forEach((log: any) => {
    const { id, currency0, currency1 } = log
    poolMap[id.toLowerCase()] = { currency0, currency1 }
  })

  const swapLogs = await getLogs({
    target,
    eventAbi: swapAbi,
  })

  const BigIntE6 = BigInt(1e6)

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
}

async function fetch({ getLogs, createBalances, chain }: FetchOptions) {
  const { clPoolManager, binPoolManager, fromBlock, blacklistTokens } = config[chain]
  const dailyVolume = createBalances()
  const swapFees = createBalances()
  const revenue = createBalances()

  await Promise.all([
    trackPoolManager({
      getLogs, chain, fromBlock, blacklistTokens,
      target: clPoolManager,
      initializeAbi: 'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint160 sqrtPriceX96, int24 tick)',
      swapAbi: 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint16 protocolFee)',
      dailyVolume, swapFees, revenue,
    }),
    trackPoolManager({
      getLogs, chain, fromBlock, blacklistTokens,
      target: binPoolManager,
      initializeAbi: 'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint24 activeId)',
      swapAbi: 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint24 activeId, uint24 fee, uint16 protocolFee)',
      dailyVolume, swapFees, revenue,
    }),
  ])

  const dailyFees = swapFees.clone(1, METRIC.SWAP_FEES);
  const dailySupplySideRevenue = createBalances()

  const lpRevenue = swapFees.clone(1);
  lpRevenue.subtract(revenue);
  dailySupplySideRevenue.add(lpRevenue, METRIC.LP_REVENUE);

  const dailyRevenue = revenue.clone(1, METRIC.PROTOCOL_REVENUE);
  const dailyProtocolRevenue = revenue.clone(1, METRIC.PROTOCOL_REVENUE);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}


export default adapter
