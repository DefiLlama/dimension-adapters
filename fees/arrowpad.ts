import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json'
import { METRIC } from "../helpers/metrics";

// ArrowPad.fun — token launchpad on Robinhood Chain.
// Every launch creates a Uniswap V3 pool on the 1% fee tier with the token as
// token0 (CREATE2 salt-mined below WETH) and WETH as token1. The LP NFT is
// locked forever; collected fees split 80% to the token creator / 20% to the
// protocol treasury (hard-coded in the ArrowPadLocker).
const FACTORY = '0x69225A43B20B824F4027B201731d9a21368Bf6Bc'
const FACTORY_DEPLOY_BLOCK = 11839565
const WETH = ADDRESSES[CHAIN.ROBINHOOD].WETH
const POOL_FEE = 0.01 // all pools are created on the 1% tier
const PROTOCOL_SHARE = 0.2

const TOKEN_CREATED_EVENT =
  'event TokenCreated(address indexed token, address indexed creator, address pool, uint256 positionId, string name, string symbol, string metadataURI, uint256 initialBuyWei, uint256 tokensBought)'
const UNI_V3_SWAP_EVENT =
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const launches = await options.getLogs({
    target: FACTORY,
    eventAbi: TOKEN_CREATED_EVENT,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  })
  const pools = launches.map((launch: any) => launch.pool)

  if (pools.length) {
    const swapLogs = await options.getLogs({
      targets: pools,
      eventAbi: UNI_V3_SWAP_EVENT,
    })
    for (const log of swapLogs) {
      // amount1 is always the WETH leg — fee is 1% of the traded WETH.
      const weth = Math.abs(Number(log.amount1))
      dailyFees.add(WETH, weth * POOL_FEE, METRIC.SWAP_FEES)
      dailyRevenue.add(WETH, weth * POOL_FEE * PROTOCOL_SHARE, "Token Swap Fees to Protocol")
      dailySupplySideRevenue.add(WETH, weth * POOL_FEE * (1 - PROTOCOL_SHARE), "Token Swap Fees to Creators")
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'The 1% Uniswap V3 pool fee paid on every swap of tokens launched via ArrowPad (measured on the WETH leg).',
  UserFees: 'The 1% Uniswap V3 pool fee paid on every swap of tokens launched via ArrowPad (measured on the WETH leg).',
  Revenue: "The protocol's immutable 20% share of the pool fees.",
  ProtocolRevenue: "The protocol's immutable 20% share of the pool fees.",
  SupplySideRevenue: 'The 80% share of pool fees that streams to the token creators.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Per-pool swap fees charged on input amount.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Per-pool swap fees charged on input amount.",
  },
  Revenue: {
    "Token Swap Fees to Protocol": "The protocol's immutable 20% share of the pool fees.",
  },
  ProtocolRevenue: {
    "Token Swap Fees to Protocol": "The protocol's immutable 20% share of the pool fees.",
  },
  SupplySideRevenue: {
    "Token Swap Fees to Creators": "The 80% share of pool fees that streams to the token creators.",
  },
}

export default {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: '2026-07-17',
    },
  },
  doublecounted: true, // pools are plain Uniswap V3, also counted by the uniswap adapter
  methodology,
  breakdownMethodology,
} as Adapter
