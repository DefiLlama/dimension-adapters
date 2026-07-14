import * as sdk from '@defillama/sdk'
import { BaseAdapter, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const POOL_MANAGER = '0x000000000004444c5dc75cB358380D2e3dE08A90'
const POSITION_MANAGER = '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e'
const SATO_USDT_POOL = '0x22160dfecfbacec253735e91ec2d8c1b26adb556df3c97409eff5a14819ca958'

const SWAP_EVENT =
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)'
const POOL_KEYS =
  'function poolKeys(bytes25) view returns(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)'

function getPoolKey(poolId: string): string {
  return poolId.slice(0, 52)
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const events = await sdk.getEventLogs({
    chain: options.chain,
    target: POOL_MANAGER,
    eventAbi: SWAP_EVENT,
    fromBlock: Number(options.fromApi.block),
    toBlock: Number(options.toApi.block),
    maxBlockRange: 10000,
    onlyArgs: true,
  })

  const poolKeys = await options.api.multiCall({
    abi: POOL_KEYS,
    calls: [{
      target: POSITION_MANAGER,
      params: [getPoolKey(SATO_USDT_POOL)],
    }],
    permitFailure: true,
  })

  if (!poolKeys[0]) return { dailyVolume, dailyFees }

  for (const event of events) {
    if (String(event.id).toLowerCase() !== SATO_USDT_POOL.toLowerCase()) continue

    // SATO is currency0 in the verified SATO/USDT pool. Use one side only
    // so the same swap is not counted twice.
    const amount0 = Math.abs(Number(event.amount0))
    dailyVolume.add(poolKeys[0].currency0, amount0)
    dailyFees.add(poolKeys[0].currency0, amount0 * (Number(event.fee) / 1e6))
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2026-05-03',
    },
  } as BaseAdapter,
  methodology: {
    Volume: 'Counts the SATO side of each matching Uniswap v4 PoolManager Swap event for the verified SATO/USDT pool. Only one side of each swap is counted to avoid double counting.',
    Fees: 'Calculates swap fees from the fee field emitted by the Uniswap v4 PoolManager Swap event.',
    UserFees: 'Swap fees paid by users.',
    Revenue: 'SATO protocol revenue is not counted because no verifiable protocol share is identified in the submitted scope.',
    ProtocolRevenue: 'No protocol revenue is counted in this adapter.',
    SupplySideRevenue: 'All calculated pool swap fees are attributed to the liquidity side.',
    HoldersRevenue: 'No revenue is attributed to token holders.',
  },
  fetch,
}

export default adapter
