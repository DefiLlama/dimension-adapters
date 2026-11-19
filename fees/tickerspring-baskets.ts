import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { isCoreAsset } from "../helpers/prices";

// TickerSpring Baskets are weighted pools on TickerSpring's own deployment of the unchanged Balancer v3 contracts: every
// basket swaps, and every unbalanced add or remove pays its swap fee, through the one vault.
// vault: https://robin.etherscan.io/address/0xb01B26D72EB3a5d7846C36fc21e4e3B96994DaF2
// The TickerSpring admin wallet 0x0006776A8B00dB9ac842B3f926513cF49473E000 holds every basket's pool roles (pause manager,
// swap fee manager and pool creator) and the protocol fee controller 0x093011359d26df42608C568eff941dd59cd5401B, so the
// vault's whole aggregate share of each fee (protocol plus pool creator) is TickerSpring's; the rest stays in the pool
// for the basket's holders.
const VAULT = '0xb01B26D72EB3a5d7846C36fc21e4e3B96994DaF2'

const events = {
  swap: 'event Swap(address indexed pool, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 swapFeePercentage, uint256 swapFeeAmount)',
  // swapFeeAmountsRaw: the total swap fees an unbalanced add or remove charged, in the pool's token registration order
  added: 'event LiquidityAdded(address indexed pool, address indexed liquidityProvider, uint8 indexed kind, uint256 totalSupply, uint256[] amountsAddedRaw, uint256[] swapFeeAmountsRaw)',
  removed: 'event LiquidityRemoved(address indexed pool, address indexed liquidityProvider, uint8 indexed kind, uint256 totalSupply, uint256[] amountsRemovedRaw, uint256[] swapFeeAmountsRaw)',
}

const abis = {
  getPoolTokens: 'function getPoolTokens(address pool) view returns (address[] tokens)',
  // aggregateSwapFeePercentage = share of every fee the vault withholds (protocol + pool creator), the rest stays with holders
  getPoolConfig: 'function getPoolConfig(address pool) view returns (tuple(tuple(bool disableUnbalancedLiquidity, bool enableAddLiquidityCustom, bool enableRemoveLiquidityCustom, bool enableDonation) liquidityManagement, uint256 staticSwapFeePercentage, uint256 aggregateSwapFeePercentage, uint256 aggregateYieldFeePercentage, uint40 tokenDecimalDiffs, uint32 pauseWindowEndTime, bool isPoolRegistered, bool isPoolInitialized, bool isPoolPaused, bool isPoolInRecoveryMode))',
}

const SWAP_FEES_TO_PROTOCOL = 'Swap Fees To Protocol'
const SWAP_FEES_TO_HOLDERS = 'Swap Fees To Basket Holders'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const [swaps, adds, removes] = await Promise.all([
    options.getLogs({ target: VAULT, eventAbi: events.swap }),
    options.getLogs({ target: VAULT, eventAbi: events.added }),
    options.getLogs({ target: VAULT, eventAbi: events.removed }),
  ])
  const liquidity = [...adds, ...removes].filter((log: any) => log.swapFeeAmountsRaw.some((fee: any) => BigInt(fee) > 0n))
  if (!swaps.length && !liquidity.length) return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue }

  // fee shares change rarely (governance), read them at the window end (a pool created mid-window does not exist at the opening block)
  const pools = [...new Set([...swaps, ...liquidity].map((log: any) => log.pool.toLowerCase()))]
  const liquidityPools = [...new Set(liquidity.map((log: any) => log.pool.toLowerCase()))]
  const [poolConfigs, poolTokens] = await Promise.all([
    options.api.multiCall({ target: VAULT, abi: abis.getPoolConfig, calls: pools }),
    options.api.multiCall({ target: VAULT, abi: abis.getPoolTokens, calls: liquidityPools }),
  ])
  // percentages are 18-decimal fixed point (1e18 = 100%), kept as bigint so raw amounts don't lose precision
  const ONE = 10n ** 18n
  const aggregate: Record<string, bigint> = {}
  pools.forEach((pool, i) => { aggregate[pool] = BigInt(poolConfigs[i].aggregateSwapFeePercentage) })
  const tokensOf: Record<string, string[]> = {}
  liquidityPools.forEach((pool, i) => { tokensOf[pool] = poolTokens[i] })

  const addFee = (pool: string, token: string, fee: bigint) => {
    if (!fee) return
    const protocolFee = fee * aggregate[pool] / ONE
    dailyFees.add(token, fee, METRIC.SWAP_FEES)
    dailyRevenue.add(token, protocolFee, SWAP_FEES_TO_PROTOCOL)
    dailySupplySideRevenue.add(token, fee - protocolFee, SWAP_FEES_TO_HOLDERS)
  }

  swaps.forEach((log: any) => {
    // swapFeeAmount is charged in tokenIn and amountIn includes it; when only tokenOut is priced, convert the fee at the swap's rate
    const amountIn = BigInt(log.amountIn)
    let token = log.tokenIn, fee = BigInt(log.swapFeeAmount)
    if (!isCoreAsset(options.chain, log.tokenIn) && amountIn > 0n) {
      token = log.tokenOut
      fee = fee * BigInt(log.amountOut) / amountIn
    }
    addFee(log.pool.toLowerCase(), token, fee)
  })

  liquidity.forEach((log: any) => {
    const pool = log.pool.toLowerCase()
    log.swapFeeAmountsRaw.forEach((fee: any, i: number) => addFee(pool, tokensOf[pool][i], BigInt(fee)))
  })

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-10-08', // vault deployed 2026-10-08 20:09 UTC, first basket created the same evening
  methodology: {
    Fees: "Swap fees paid on every basket swap and on every unbalanced add or remove of liquidity.",
    UserFees: "Swap fees paid on every basket swap and on every unbalanced add or remove of liquidity.",
    Revenue: "The vault's aggregate share of each swap fee (protocol plus pool creator fee), read per basket from the vault. TickerSpring holds both.",
    ProtocolRevenue: "The vault's aggregate share of each swap fee, which goes to TickerSpring.",
    SupplySideRevenue: "Swap fees kept in the basket for its holders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fees paid on every basket swap and on every unbalanced add or remove of liquidity.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Swap fees paid on every basket swap and on every unbalanced add or remove of liquidity.",
    },
    Revenue: {
      [SWAP_FEES_TO_PROTOCOL]: "Share of swap fees the vault withholds for TickerSpring (protocol and pool creator fee).",
    },
    ProtocolRevenue: {
      [SWAP_FEES_TO_PROTOCOL]: "Share of swap fees the vault withholds for TickerSpring (protocol and pool creator fee).",
    },
    SupplySideRevenue: {
      [SWAP_FEES_TO_HOLDERS]: "Share of swap fees left in the basket for its holders.",
    },
  },
}

export default adapter
