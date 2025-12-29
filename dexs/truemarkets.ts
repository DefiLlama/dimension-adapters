import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import ADDRESSES from '../helpers/coreAssets.json'

// TrueMarkets contract addresses on Base
// https://github.com/truemarketsorg/true-contracts/blob/main/network_config.json
const CONTRACTS = {
  TRUTH_MARKET_MANAGER: '0x61A98Bef11867c69489B91f340fE545eEfc695d7',
  FEE_COLLECTOR: '0x39339E149c2D916aa899Bf73D2Debb15F4755d9D',
  UNISWAP_V4_POOL_MANAGER: '0x498581fF718922c3f8e6A244956aF099B2652b2b',
  TYD_TOKEN: '0xb13cf163d916917d9cd6e836905ca5f12a1def4b',
}

const ABI = {
  numberOfActiveMarkets: 'uint256:numberOfActiveMarkets',
  getActiveMarketAddress: 'function getActiveMarketAddress(uint256 index) view returns (address)',
  getPoolIds: 'function getPoolIds() view returns (bytes32, bytes32)',
  getPoolAddresses: 'function getPoolAddresses() view returns (address, address)',
  token0: 'address:token0',
  convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
  PoolFeeTracked:
    'event PoolFeeTracked(bytes32 indexed poolId, address indexed currency, uint256 amount)',
  SwapV4:
    'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
  SwapV3:
    'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
}

const SWAP_TOPIC_V4 = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f'
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

const abs = (n: bigint) => (n < 0n ? -n : n)

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const USDC = ADDRESSES.base.USDC
  const TYD = CONTRACTS.TYD_TOKEN.toLowerCase()

  const convertTydToUsdc = async (tydAmount: bigint) => {
    if (tydAmount === 0n) return 0n
    return BigInt(
      await options.api.call({
        target: CONTRACTS.TYD_TOKEN,
        abi: ABI.convertToAssets,
        params: [tydAmount.toString()],
      })
    )
  }

  // Fetch and process fee events
  const feeTrackedLogs = await options.getLogs({
    target: CONTRACTS.FEE_COLLECTOR,
    eventAbi: ABI.PoolFeeTracked,
  })

  let totalTydFees = 0n
  feeTrackedLogs.forEach((log: any) => {
    if (log.currency.toLowerCase() === TYD) {
      totalTydFees += BigInt(log.amount)
    } else {
      dailyFees.add(log.currency, log.amount)
    }
  })
  const totalUsdcFees = await convertTydToUsdc(totalTydFees)
  dailyFees.add(USDC, totalUsdcFees)

  // Get number of active markets
  const numMarkets = await options.api.call({
    target: CONTRACTS.TRUTH_MARKET_MANAGER,
    abi: ABI.numberOfActiveMarkets,
  })

  if (!numMarkets || Number(numMarkets) === 0) {
    return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
  }

  // Get all active market addresses
  const marketIndexes = Array.from({ length: Number(numMarkets) }, (_, i) => i)
  const marketAddresses = await options.api.multiCall({
    abi: ABI.getActiveMarketAddress,
    calls: marketIndexes.map((i) => ({ target: CONTRACTS.TRUTH_MARKET_MANAGER, params: [i] })),
  })

  // Fetch V4 pool IDs first, then fall back to V3 pool addresses only when needed
  const poolIdsResults = await options.api.multiCall({
    abi: ABI.getPoolIds,
    calls: marketAddresses,
    permitFailure: true,
  })

  const v4PoolIds: string[] = []
  const v3PoolAddresses: string[] = []
  const missingPoolIndexes: number[] = []

  marketAddresses.forEach((_: any, i: number) => {
    const poolIds = poolIdsResults[i]
    if (poolIds) {
      const [yesPoolId, noPoolId] = poolIds
      if (yesPoolId && noPoolId && yesPoolId !== ZERO_BYTES32 && noPoolId !== ZERO_BYTES32) {
        v4PoolIds.push(yesPoolId, noPoolId)
        return
      }
    }
    missingPoolIndexes.push(i)
  })

  if (missingPoolIndexes.length > 0) {
    const poolAddrsResults = await options.api.multiCall({
      abi: ABI.getPoolAddresses,
      calls: missingPoolIndexes.map((i) => marketAddresses[i]),
      permitFailure: true,
    })

    poolAddrsResults.forEach((result: any) => {
      if (!result) return
      const [yesPool, noPool] = result
      if (yesPool && yesPool !== ADDRESSES.null) {
        v3PoolAddresses.push(yesPool.toLowerCase())
      }
      if (noPool && noPool !== ADDRESSES.null) {
        v3PoolAddresses.push(noPool.toLowerCase())
      }
    })
  }

  const uniqueV4PoolIds = [...new Set(v4PoolIds)]
  const uniqueV3Pools = [...new Set(v3PoolAddresses)]

  let totalTydVolume = 0n

  if (uniqueV4PoolIds.length > 0) {
    const v4SwapLogsPerPool = await Promise.all(
      uniqueV4PoolIds.map((poolId) =>
        options.getLogs({
          target: CONTRACTS.UNISWAP_V4_POOL_MANAGER,
          topics: [SWAP_TOPIC_V4, poolId],
          eventAbi: ABI.SwapV4,
        })
      )
    )

    // For V4, TYD (6 decimals) will have smaller magnitude than outcome tokens (18 decimals)
    v4SwapLogsPerPool.flat().forEach((log: any) => {
      const [abs0, abs1] = [abs(BigInt(log.amount0)), abs(BigInt(log.amount1))]
      totalTydVolume += abs0 < abs1 ? abs0 : abs1
    })
  }

  // Fetch V3 swaps and calculate TYD/USDC volume
  if (uniqueV3Pools.length > 0) {
    const token0Results = await options.api.multiCall({
      abi: ABI.token0,
      calls: uniqueV3Pools,
      permitFailure: true,
    })

    // Map pool -> stablecoin position (0 or 1)
    const stablePosition: Record<string, 0 | 1> = {}
    uniqueV3Pools.forEach((pool, i) => {
      if (!token0Results[i]) return
      const token0 = token0Results[i].toLowerCase()
      stablePosition[pool] = token0 === TYD || token0 === USDC.toLowerCase() ? 0 : 1
    })

    const v3SwapLogs = await options.getLogs({
      targets: uniqueV3Pools,
      eventAbi: ABI.SwapV3,
      flatten: false,
    })

    v3SwapLogs.forEach((logs: any[], i: number) => {
      const pos = stablePosition[uniqueV3Pools[i]]
      if (pos === undefined) return
      logs.forEach((log: any) => {
        totalTydVolume += abs(BigInt(pos === 0 ? log.amount0 : log.amount1))
      })
    })
  }

  const totalUsdcVolume = await convertTydToUsdc(totalTydVolume)
  dailyVolume.add(USDC, totalUsdcVolume)

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const methodology = {
  Volume:
    'Volume is calculated from Swap events on TrueMarkets prediction market pools. Only the TYD side of swaps is counted, then converted to USDC using the TYD vault exchange rate.',
  Fees: 'Fees are tracked via PoolFeeTracked events from the FeeCollector contract. TYD fees are converted to USDC using the vault exchange rate.',
  Revenue: 'All collected fees are considered protocol revenue.',
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-03-07',
    },
  },
  methodology,
}

export default adapter
