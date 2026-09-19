import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'

// SolonPad — launchpad on Arc where tokens launch straight into permanently
// locked Uniswap v4 pools. Every launch pool's full liquidity is held by the
// protocol's FeeSplitter (the position is locked forever), so the pool's 1%
// LP fee on swap volume IS the protocol's fee take, split 50/50 between the
// platform and the token's creator by the splitter contract.
// https://solonpad.fun · https://github.com/solonlend/solonpad-contracts
//
// Fees: 1% of swap volume in the launchpad's own native-USDC v4 pools
// (volume read from PoolManager Swap events on the pools enumerated from the
// launch strategy's TokenLaunched events — the same registry the TVL adapter
// uses). Arc's gas token is native USDC, and currency0 of every counted pool
// is the native currency, so |amount0| is the trade's USD leg directly.
//
// Splits, from the on-chain fee splitter and the published treasury policy
// (50% of the platform share market-buys SOLON, every buyback a public
// transaction from the treasury):
//   creator half        -> SupplySideRevenue (Creator Fees)
//   platform half       -> Revenue, of which
//     buyback half      -> HoldersRevenue (Token Buy Back)
//     retained half     -> ProtocolRevenue
//
// Not counted (understates, never overstates): bonding-curve trades (the
// legacy launch mode, negligible volume since instant v4 became the default),
// tokenized-stock-quoted pools (their quote leg is not USD-priced here), and
// the 0.5% aggregator interface fee on external-pool trades.

const STRATEGY = '0xfa5997445db1e9fb7f7664fd176379b6b26497f0'
const POOL_MANAGER = '0x8366a39CC670B4001A1121B8F6A443A643e40951'
const V4_FROM_BLOCK = 21153856
const LP_FEE = 0.01 // every launch pool is created with the fixed 1% fee tier

const instantLaunch = 'event TokenLaunched(bytes32 indexed poolId, address indexed token, address indexed finalPositionRecipient, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key)'
const swapEvent = 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  // Registry of the launchpad's own pools (full history, cached); count only
  // native-USDC-quoted pools so |amount0| is always the USD leg.
  const launches = await options.getLogs({ target: STRATEGY, eventAbi: instantLaunch, fromBlock: V4_FROM_BLOCK, cacheInCloud: true })
  const ownPools = new Set(
    launches.filter((launch: any) => launch.key.currency0 === ADDRESSES.null).map((launch: any) => launch.poolId.toLowerCase()),
  )
  if (ownPools.size) {
    const swaps = await options.getLogs({ target: POOL_MANAGER, eventAbi: swapEvent })
    let volume = 0n
    for (const swap of swaps) {
      if (!ownPools.has(swap.id.toLowerCase())) continue
      const amount0 = BigInt(swap.amount0)
      volume += amount0 < 0n ? -amount0 : amount0
    }
    // Native USDC has 18 decimals; the ERC20 interface at 0x3600… has 6.
    const fees = (volume * BigInt(LP_FEE * 10000)) / 10000n / 10n ** 12n
    dailyFees.add(ADDRESSES.arc.USDC, fees, METRIC.SWAP_FEES)
  }

  const dailySupplySideRevenue = dailyFees.clone(0.5, METRIC.CREATOR_FEES) // creator half of the splitter
  const dailyRevenue = dailyFees.clone(0.5)                                // platform half of the splitter
  const dailyHoldersRevenue = dailyFees.clone(0.25, METRIC.TOKEN_BUY_BACK) // half the platform share buys SOLON
  const dailyProtocolRevenue = dailyFees.clone(0.25)                       // the retained remainder
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue }
}

const methodology = {
  Fees: '1% LP fee on swap volume in the launchpad\'s own native-USDC Uniswap v4 pools. All launch liquidity is permanently locked in a protocol-held position, so the whole LP fee is protocol income before the split.',
  Revenue: 'The platform\'s half of the LP fee (the FeeSplitter pays the other half to each token\'s creator).',
  ProtocolRevenue: 'The half of the platform share retained by the treasury.',
  HoldersRevenue: 'The half of the platform share that market-buys SOLON on-chain under the standing buyback policy.',
  SupplySideRevenue: 'The creator\'s half of each pool\'s LP fee.',
}

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: '1% of swap volume in own native-USDC v4 launch pools. Excludes bonding-curve trades, stock-quoted pools and the 0.5% aggregator fee (all understatements).' },
  SupplySideRevenue: { [METRIC.CREATOR_FEES]: 'Creator half of the locked-position LP fee.' },
  HoldersRevenue: { [METRIC.TOKEN_BUY_BACK]: 'On-chain SOLON buybacks funded by 50% of the platform share.' },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: '2026-09-14', // first instant-v4 launch (block 21153856)
  methodology,
  breakdownMethodology,
}

export default adapter
