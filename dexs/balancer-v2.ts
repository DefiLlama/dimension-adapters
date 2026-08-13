import { FetchOptions } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { addOneToken } from '../helpers/prices'

const ESTIMATED_NON_CORE_SHARE = 0.7;
const ESTIMATED_CORE_SHARE = 0.3;
const HOLDERS_SHARE_NON_CORE = 0.825; // 82.5% for non-core pools
const HOLDERS_SHARE_CORE = 0.125; // 12.5% for core pools

const weightedHoldersShare = ESTIMATED_NON_CORE_SHARE * HOLDERS_SHARE_NON_CORE + ESTIMATED_CORE_SHARE * HOLDERS_SHARE_CORE;

const revenueRatio = 0.5;
const TOKENOMICS_REVAMP_DATE = "2026-04-23";

const VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'

const LABELS = {
  SwapFees: 'Token Swap Fees',
  FlashloanFees: 'Flashloan Fees',
  ToProtocol: 'Protocol Fees',
  ToLPs: 'Token Swap Fees To LPs',
}

const event_pools_balance_change = "event PoolBalanceChanged(bytes32 indexed poolId,address indexed liquidityProvider,address[] tokens,int256[] deltas,uint256[] protocolFeeAmounts)"
const event_flash_bot = "event FlashLoan(address indexed recipient,address indexed token,uint256 amount,uint256 feeAmount)"
const event_swap = "event Swap(bytes32 indexed poolId,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut)"

const abis = {
  getPool: "function getPool(bytes32 poolId) view returns (address, uint8)",
  getSwapFeePercentage: "uint256:getSwapFeePercentage"
}

async function getFees(options: FetchOptions) {
  const { createBalances, api, getLogs } = options
  const dailyFees = createBalances()
  const dailyVolume = createBalances()

  const logs_swap = await getLogs({ target: VAULT, eventAbi: event_swap, })
  const logs_balance = await getLogs({ target: VAULT, eventAbi: event_pools_balance_change, })
  const logs_flash_bot = await getLogs({ target: VAULT, eventAbi: event_flash_bot, })
  logs_balance.forEach((log: any) => dailyFees.add(log.tokens, log.protocolFeeAmounts, LABELS.SwapFees))
  logs_flash_bot.forEach((log: any) => dailyFees.add(log.token, log.feeAmount, LABELS.FlashloanFees))
  const poolIds = Array.from(new Set(logs_swap.map((a: any) => a.poolId)))
  const pools = (await api.multiCall({ abi: abis.getPool, calls: poolIds, target: VAULT })).map((i: any) => i[0])
  const swapFees = await api.multiCall({ abi: abis.getSwapFeePercentage, calls: pools, permitFailure: true })
  logs_swap.forEach((log: any) => {
    const index = poolIds.indexOf(log.poolId)
    if (index === -1) return;
    const fee = swapFees[index] ? swapFees[index] / 1e18 : 0
    dailyFees.add(log.tokenOut, Number(log.amountOut) * fee, LABELS.SwapFees)
    addOneToken({ chain: api.chain, balances: dailyVolume, token0: log.tokenIn, token1: log.tokenOut, amount0: log.amountIn, amount1: log.amountOut })
  })

  return { dailyFees, dailyVolume }
}

async function fetch(options: FetchOptions) {
  // https://x.com/Balancer/status/1988685056982835470
  const WhitehatActivitiesChains: Array<string> = [
    CHAIN.ETHEREUM,
    CHAIN.OPTIMISM,
    CHAIN.ARBITRUM,
  ]
  if ((options.startOfDay === 1762992000 || options.startOfDay === 1762905600) && WhitehatActivitiesChains.includes(options.chain)) {
    return {
      dailyVolume: 0,
      dailyFees: 0,
      dailyRevenue: 0,
      dailyProtocolRevenue: 0,
      dailySupplySideRevenue: 0,
      dailyHoldersRevenue: 0,
    }
  }

  const holderRevenueRatio = options.dateString >= TOKENOMICS_REVAMP_DATE ? 0 : revenueRatio * weightedHoldersShare;
  const protocolRevenueRatio = revenueRatio - holderRevenueRatio;

  const { dailyFees, dailyVolume } = await getFees(options)

  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  dailyRevenue.addBalances(dailyFees, LABELS.ToProtocol)
  dailySupplySideRevenue.addBalances(dailyFees, LABELS.ToLPs)
  dailyRevenue.resizeBy(revenueRatio)
  dailySupplySideRevenue.resizeBy(1 - revenueRatio)

  return {
    dailyFees,
    dailyVolume,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyFees.clone(protocolRevenueRatio, LABELS.ToProtocol),
    dailyHoldersRevenue: dailyFees.clone(holderRevenueRatio, LABELS.ToProtocol),
  }
}

export default {
  version: 2,
  fetch: fetch,
  methodology: {
    Fees: "All trading fees collected (includes swap and yield fee)",
    UserFees: "Trading fees paid by users, ranging from 0.0001% to 10%",
    Revenue: "Balancer V2 protocol collects 50% swap fees as revenue.",
    ProtocolRevenue: "Share of revenue to Balancer DAO.",
    HoldersRevenue: "Share of revenue to veBAL holders (None after 2026-04-23)",
    SupplySideRevenue: "50% from swap fees paid by traders are shared to pool LPs",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.SwapFees]: "Swap fees paid by users on each trade (0.0001% to 10%).",
      [LABELS.FlashloanFees]: "Fees paid by borrowers on Balancer V2 flash loans.",
    },
    Revenue: {
      [LABELS.ToProtocol]: "50% of collected fees taken as protocol revenue.",
    },
    ProtocolRevenue: {
      [LABELS.ToProtocol]: "Share of revenue kept by the Balancer DAO.",
    },
    HoldersRevenue: {
      [LABELS.ToProtocol]: "Share of revenue distributed to veBAL holders (none after 2026-04-23).",
    },
    SupplySideRevenue: {
      [LABELS.ToLPs]: "50% of collected fees distributed to pool liquidity providers.",
    },
  },
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2021-04-23',
    },
    [CHAIN.POLYGON]: {
      start: '2021-06-24',
    },
    [CHAIN.ARBITRUM]: {
      start: '2021-08-31',
    },
    [CHAIN.AVAX]: {
      start: '2023-02-25',
    },
    [CHAIN.XDAI]: {
      start: '2023-01-10',
    },
    [CHAIN.BASE]: {
      start: '2023-07-26',
    },
    [CHAIN.MODE]: {
      start: '2024-05-22',
    },
    [CHAIN.FRAXTAL]: {
      start: '2024-05-20',
    },
    [CHAIN.OPTIMISM]: {
      start: '2022-05-04',
    },
  },
}
