import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getUniV2LogAdapter, getUniV3LogAdapter } from '../../helpers/uniswap'

const V2_FACTORY = '0x65b3cc7a7cb167221266fc93884717de2dbd074e'
const V3_FACTORY = '0xa83f730fd076574f9ad6b54af653ab9e4743d3ac'
const V3_POSITION_MANAGER = '0x018810f07310cb73ccb9908186444bdd97ecb581'
const V3_START_TIMESTAMP = 1791936000
const V3_SWAP_EVENT =
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

const TOTAL_SWAP_FEE = 0.0025
const PROTOCOL_FEE_SHARE = 8 / 25
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const V3_POSITION_ABI =
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)'

const fetchV2 = getUniV2LogAdapter({
  factory: V2_FACTORY,
  fees: TOTAL_SWAP_FEE,
  allowReadPairs: true,
})

const fetchV2WithFees = async (options: FetchOptions) => {
  const result = await fetchV2(options)
  const feeTo = await options.api.call({ target: V2_FACTORY, abi: 'address:feeTo' })
  const feeOn = feeTo && feeTo.toLowerCase() !== ZERO_ADDRESS
  const dailyFees = result.dailyFees

  return {
    ...result,
    dailyUserFees: dailyFees.clone(1, 'Trading fees'),
    dailyRevenue: feeOn ? dailyFees.clone(PROTOCOL_FEE_SHARE, 'Protocol fees') : 0,
    dailyProtocolRevenue: feeOn ? dailyFees.clone(PROTOCOL_FEE_SHARE, 'Protocol fees') : 0,
    dailySupplySideRevenue: dailyFees.clone(feeOn ? 1 - PROTOCOL_FEE_SHARE : 1, 'LP fees'),
  }
}

const getV3Pools = async (options: FetchOptions) => {
  const totalSupply = Number(await options.api.call({ target: V3_POSITION_MANAGER, abi: 'uint256:totalSupply' }))
  if (!totalSupply) return []

  const tokenIds = await options.api.multiCall({
    target: V3_POSITION_MANAGER,
    abi: 'function tokenByIndex(uint256 index) view returns (uint256)',
    calls: Array.from({ length: totalSupply }, (_, index) => index),
  })
  const positions = await options.api.multiCall({ target: V3_POSITION_MANAGER, abi: V3_POSITION_ABI, calls: tokenIds })
  const recipes = new Map<string, { token0: string; token1: string; fee: any }>()

  positions.forEach((position: any) => {
    const token0 = position.token0 || position[2]
    const token1 = position.token1 || position[3]
    const fee = position.fee ?? position[4]
    recipes.set(`${token0}:${token1}:${fee}`.toLowerCase(), { token0, token1, fee })
  })

  const uniqueRecipes = [...recipes.values()]
  const poolAddresses = await options.api.multiCall({
    target: V3_FACTORY,
    abi: 'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
    calls: uniqueRecipes.map(({ token0, token1, fee }) => ({ params: [token0, token1, fee] })),
  })
  return poolAddresses.filter((address: string) => address && address.toLowerCase() !== ZERO_ADDRESS)
}

const fetchV3ForPools = (pools: string[]) => getUniV3LogAdapter({
  pools,
  swapEvent: V3_SWAP_EVENT,
  userFeesRatio: 1,
  customLogic: async ({ pairObject, dailyVolume, dailyFees, filteredPairs, fetchOptions }: any) => {
    const pools = Object.keys(filteredPairs)
    const protocolRevenue = fetchOptions.createBalances()
    const supplySideRevenue = dailyFees.clone()

    if (pools.length) {
      const swapLogs = await fetchOptions.getLogs({ targets: pools, eventAbi: V3_SWAP_EVENT, flatten: false })

      swapLogs.forEach((logs: any[], index: number) => {
        const [token0, token1] = pairObject[pools[index]]
        logs.forEach((log: any) => {
          const protocolFee0 = BigInt(log.protocolFeesToken0.toString())
          const protocolFee1 = BigInt(log.protocolFeesToken1.toString())

          if (protocolFee0 > 0n) {
            protocolRevenue.add(token0, protocolFee0)
            supplySideRevenue.add(token0, -protocolFee0)
          }
          if (protocolFee1 > 0n) {
            protocolRevenue.add(token1, protocolFee1)
            supplySideRevenue.add(token1, -protocolFee1)
          }
        })
      })
    }

    const labeledFees = dailyFees.clone(1, 'Token Swap Fees')
    const labeledProtocolRevenue = protocolRevenue.clone(1, 'Protocol fees')
    return {
      dailyVolume,
      dailyFees: labeledFees,
      dailyUserFees: labeledFees.clone(1, 'Trading fees'),
      dailyRevenue: labeledProtocolRevenue,
      dailyProtocolRevenue: labeledProtocolRevenue,
      dailySupplySideRevenue: supplySideRevenue.clone(1, 'LP fees'),
    }
  },
})

const METRICS = [
  'dailyVolume',
  'dailyFees',
  'dailyUserFees',
  'dailyRevenue',
  'dailyProtocolRevenue',
  'dailySupplySideRevenue',
] as const

const fetch = async (options: FetchOptions) => {
  const results: any[] = [await fetchV2WithFees(options)]
  if (options.endTimestamp >= V3_START_TIMESTAMP) {
    const pools = await getV3Pools(options)
    if (pools.length) results.push(await fetchV3ForPools(pools)(options))
  }

  return Object.fromEntries(METRICS.map((metric) => {
    const balances = options.createBalances()
    results.forEach((result) => {
      if (result[metric]) balances.add(result[metric])
    })
    return [metric, balances]
  }))
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: 'Volume is derived from Swap events emitted by BitBlocks Finance V2 pairs and V3 concentrated-liquidity pools on BNB Smart Chain.',
    Fees: 'V2 traders pay 0.25%. V3 traders pay the fee tier configured for the pool: 0.01%, 0.05%, 0.30%, or 1%.',
    UserFees: 'Users pay the full swap fee charged by the selected V2 or V3 pool.',
    Revenue: 'V2 protocol revenue is 32% of swap fees while feeTo is enabled. V3 protocol revenue is the exact amount emitted as protocolFeesToken0 or protocolFeesToken1 by each swap.',
    ProtocolRevenue: 'V2 protocol revenue accrues through LP token minting. V3 protocol revenue accrues in each pool according to its governance-controlled protocol fee.',
    SupplySideRevenue: 'Liquidity providers receive total swap fees minus the protocol share. V3 uses the exact protocol-fee amounts emitted by each swap.',
  },
  breakdownMethodology: {
    Fees: { 'Token Swap Fees': 'Trading fees paid by users on V2 and V3 swaps.' },
    UserFees: { 'Trading fees': 'The full trading fee paid by swap users.' },
    Revenue: { 'Protocol fees': 'The portion of swap fees accruing to the protocol.' },
    ProtocolRevenue: { 'Protocol fees': 'Swap fees controlled by the BitBlocks Finance protocol.' },
    SupplySideRevenue: { 'LP fees': 'The portion of swap fees accruing to liquidity providers.' },
  },
  adapter: {
    [CHAIN.BSC]: { fetch, start: '2022-04-26' },
  },
}

export default adapter
