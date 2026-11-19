import { FetchOptions } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { addOneToken } from '../helpers/prices'

const ESTIMATED_NON_CORE_SHARE = 0.7;
const ESTIMATED_CORE_SHARE = 0.3;
const HOLDERS_SHARE_NON_CORE = 0.825; // 82.5% for non-core pools
const HOLDERS_SHARE_CORE = 0.125; // 12.5% for core pools

const weightedHoldersShare = ESTIMATED_NON_CORE_SHARE * HOLDERS_SHARE_NON_CORE + ESTIMATED_CORE_SHARE * HOLDERS_SHARE_CORE;

const TOKENOMICS_REVAMP_DATE = "2026-04-23";

const VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'

const LABELS = {
  SwapFees: 'Token Swap Fees',
  FlashloanFees: 'Flashloan Fees',
  ToProtocol: 'Protocol Fees',
  ToLPs: 'Token Swap Fees To LPs',
}

const event_flash_bot = "event FlashLoan(address indexed recipient,address indexed token,uint256 amount,uint256 feeAmount)"
const event_swap = "event Swap(bytes32 indexed poolId,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut)"

const abis = {
  getPool: "function getPool(bytes32 poolId) view returns (address, uint8)",
  getSwapFeePercentage: "uint256:getSwapFeePercentage",
  getProtocolFeesCollector: "address:getProtocolFeesCollector",
  // fee type 0 = swap; pools from 2022 on cache the protocol swap fee, older pools have no cache and use the collector's
  getProtocolFeePercentageCache: "function getProtocolFeePercentageCache(uint256 feeType) view returns (uint256)",
}

async function getFees(options: FetchOptions) {
  const { createBalances, getLogs, toApi } = options
  const dailyFees = createBalances()
  const dailyVolume = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  // PoolBalanceChanged protocolFeeAmounts are not counted: they are the protocol's cut of older pools' swap fees, which the
  // per-swap fees below already include
  const logs_swap = await getLogs({ target: VAULT, eventAbi: event_swap, })
  const logs_flash_bot = await getLogs({ target: VAULT, eventAbi: event_flash_bot, })
  // flash loan fees are paid to the ProtocolFeesCollector
  logs_flash_bot.forEach((log: any) => {
    dailyFees.add(log.token, log.feeAmount, LABELS.FlashloanFees)
    dailyRevenue.add(log.token, log.feeAmount, LABELS.ToProtocol)
  })
  const poolIds = Array.from(new Set(logs_swap.map((a: any) => a.poolId)))
  const pools = (await toApi.multiCall({ abi: abis.getPool, calls: poolIds, target: VAULT })).map((i: any) => i[0])
  const swapFees = await toApi.multiCall({ abi: abis.getSwapFeePercentage, calls: pools, permitFailure: true })
  // the protocol's cut of each pool's swap fees at the window's closing block
  const collector = await toApi.call({ target: VAULT, abi: abis.getProtocolFeesCollector })
  const collectorShare = Number(await toApi.call({ target: collector, abi: abis.getSwapFeePercentage })) / 1e18
  const cachedShares = await toApi.multiCall({ abi: abis.getProtocolFeePercentageCache, calls: pools.map((pool: string) => ({ target: pool, params: [0] })), permitFailure: true })
  logs_swap.forEach((log: any) => {
    const index = poolIds.indexOf(log.poolId)
    if (index === -1) return;
    const fee = swapFees[index] ? swapFees[index] / 1e18 : 0
    const protocolShare = cachedShares[index] != null ? Number(cachedShares[index]) / 1e18 : collectorShare
    const swapFee = Number(log.amountOut) * fee
    dailyFees.add(log.tokenOut, swapFee, LABELS.SwapFees)
    dailyRevenue.add(log.tokenOut, swapFee * protocolShare, LABELS.ToProtocol)
    dailySupplySideRevenue.add(log.tokenOut, swapFee * (1 - protocolShare), LABELS.ToLPs)
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: log.tokenIn, token1: log.tokenOut, amount0: log.amountIn, amount1: log.amountOut })
  })

  return { dailyFees, dailyVolume, dailyRevenue, dailySupplySideRevenue }
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

  // share of protocol revenue sent to veBAL holders
  const holdersShare = options.dateString >= TOKENOMICS_REVAMP_DATE ? 0 : weightedHoldersShare;

  const { dailyFees, dailyVolume, dailyRevenue, dailySupplySideRevenue } = await getFees(options)

  return {
    dailyFees,
    dailyVolume,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(1 - holdersShare, LABELS.ToProtocol),
    dailyHoldersRevenue: dailyRevenue.clone(holdersShare, LABELS.ToProtocol),
  }
}

export default {
  version: 2,
  pullHourly: true,
  fetch: fetch,
  methodology: {
    Fees: "Swap fees paid by traders and flash loan fees.",
    UserFees: "Trading fees paid by users, ranging from 0.0001% to 10%",
    Revenue: "The protocol's cut of swap fees, plus flash loan fees. The cut was 50% of swap fees until it was set to 0% on 2026-10-30 (Arbitrum, Polygon, Gnosis, Base, Avalanche, Optimism) and 2026-11-05 (Ethereum); it is still 50% on Mode and Fraxtal.",
    ProtocolRevenue: "Share of revenue to Balancer DAO.",
    HoldersRevenue: "Share of revenue to veBAL holders (None after 2026-04-23)",
    SupplySideRevenue: "Swap fees kept by pool LPs: 50% while the protocol takes 50%, and 100% since the protocol cut was set to 0%.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.SwapFees]: "Swap fees paid by users on each trade (0.0001% to 10%).",
      [LABELS.FlashloanFees]: "Fees paid by borrowers on Balancer V2 flash loans.",
    },
    Revenue: {
      [LABELS.ToProtocol]: "The protocol's cut of swap fees (50%, 0% on Arbitrum, Polygon, Gnosis, Base, Avalanche and Optimism since 2026-10-30 and on Ethereum since 2026-11-05), plus all flash loan fees.",
    },
    ProtocolRevenue: {
      [LABELS.ToProtocol]: "Share of revenue kept by the Balancer DAO.",
    },
    HoldersRevenue: {
      [LABELS.ToProtocol]: "Share of revenue distributed to veBAL holders (none after 2026-04-23).",
    },
    SupplySideRevenue: {
      [LABELS.ToLPs]: "Swap fees kept by pool liquidity providers: 50%, or 100% where the protocol cut is 0%.",
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
