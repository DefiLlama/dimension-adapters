import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { uniV2Exports } from "../../helpers/uniswap";
import { LABELS, MOTO, WETH, addQuote, getCollectorSplit, getMotoToWeth, splitProtocolFees } from "../../helpers/motoswap";

// Motoswap: Uniswap v2 math DEX on Ethereum, live since 2026-09-28. https://motoswap.org
// Pairs come from the Motoswap factory. Pair.swap is only open to the Motoswap routers, and every trade goes
// through the FeeRouter, which takes a protocol fee (70 bps at launch) once per trade on the quote leg and sends it to the
// Collector, plus a creator fee (30 bps at launch) on coins graduated from moto.fun, sent to the CreatorFeeVault.
// The pair itself keeps the LP fee (factory swapFeeBps, 30 bps at launch; feeTo is unset, so all of it stays with LPs).
// Contracts:
//   Factory   https://etherscan.io/address/0x81C9CBC47d700dA1777aBd831D8dA3f526DfAe24
//   FeeRouter https://etherscan.io/address/0x9f846ef584FD44d075B5E8dF00dDB4416da61a80
//   Collector https://etherscan.io/address/0xC13307272bBf73f2191cE57d0Fb714C2A9200cF3
const FACTORY = '0x81C9CBC47d700dA1777aBd831D8dA3f526DfAe24'
const FEE_ROUTER = '0x9f846ef584FD44d075B5E8dF00dDB4416da61a80'
const DEPLOY_BLOCK = 26075263 // factory, FeeRouter and Collector deployed in this block (2026-09-28 10:09 UTC)
const HELPER_LP_FEE = 0.003 // rate passed to the uniV2 helper; rescaled below to the factory's live swapFeeBps

const PAIR_SWAP_EVENT = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'
const FEE_ROUTER_SWAP_EVENT = 'event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address feeToken, uint256 feeAmount)'
const CREATOR_FEE_EVENT = 'event CreatorFee(address indexed token, address indexed creator, address quoteAsset, uint256 amount)'

const FEE_LABELS = {
  LP: 'Swap Fees',
  PROTOCOL: 'Protocol Swap Fees',
  CREATOR: METRIC.CREATOR_FEES,
  TO_LPS: 'Swap Fees To LPs',
  TO_CREATORS: 'Creator Fees To Coin Creators',
}

const customLogic = async ({ pairObject, filteredPairs, dailyVolume, dailyFees: helperLpFees, fetchOptions }: any) => {
  const options: FetchOptions = fetchOptions
  const { createBalances } = options

  const motoToWeth = await getMotoToWeth(options)

  // Coins graduated from moto.fun get a TOKEN/WETH and a TOKEN/MOTO pair. The uniV2 helper only keeps pairs with a
  // priced core asset, so the TOKEN/MOTO pairs are added here, measured on their MOTO side (converted to WETH).
  const motoPairs = Object.keys(pairObject).filter((pair) => {
    if (filteredPairs[pair] !== undefined) return false
    return pairObject[pair].some((t: string) => t.toLowerCase() === MOTO.toLowerCase())
  })
  if (motoPairs.length) {
    const motoPairLogs = await options.getLogs({ targets: motoPairs, eventAbi: PAIR_SWAP_EVENT, flatten: false })
    motoPairLogs.forEach((logs: any[], i: number) => {
      const motoIs0 = pairObject[motoPairs[i]][0].toLowerCase() === MOTO.toLowerCase()
      for (const log of logs) {
        const motoAmount = BigInt(motoIs0 ? log.amount0In : log.amount1In) + BigInt(motoIs0 ? log.amount0Out : log.amount1Out)
        const wethAmount = motoToWeth(motoAmount)
        dailyVolume.add(WETH, wethAmount.toString())
        helperLpFees.add(WETH, Number(wethAmount) * HELPER_LP_FEE)
      }
    })
  }

  const swapFeeBps = await options.toApi.call({ target: FACTORY, abi: 'uint256:swapFeeBps' })
  const lpFees = helperLpFees.clone(Number(swapFeeBps) / 10_000 / HELPER_LP_FEE)
  const split = await getCollectorSplit(options)

  const protocolFees = createBalances()
  const routerSwaps = await options.getLogs({ target: FEE_ROUTER, eventAbi: FEE_ROUTER_SWAP_EVENT })
  for (const log of routerSwaps) {
    addQuote(protocolFees, log.feeToken, BigInt(log.feeAmount), motoToWeth, FEE_LABELS.PROTOCOL)
  }

  const creatorFees = createBalances()
  const creatorLogs = await options.getLogs({ target: FEE_ROUTER, eventAbi: CREATOR_FEE_EVENT })
  for (const log of creatorLogs) {
    addQuote(creatorFees, log.quoteAsset, BigInt(log.amount), motoToWeth, FEE_LABELS.CREATOR)
  }

  const dailyFees = createBalances()
  dailyFees.add(lpFees.clone(1, FEE_LABELS.LP))
  dailyFees.add(protocolFees.clone(1, FEE_LABELS.PROTOCOL))
  dailyFees.add(creatorFees.clone(1, FEE_LABELS.CREATOR))

  const { toStakers, toBuyback, toTreasury, toRakeback } = splitProtocolFees(protocolFees, split)

  const dailySupplySideRevenue = createBalances()
  dailySupplySideRevenue.add(lpFees.clone(1, FEE_LABELS.TO_LPS))
  dailySupplySideRevenue.add(creatorFees.clone(1, FEE_LABELS.TO_CREATORS))
  dailySupplySideRevenue.add(toRakeback)

  const dailyHoldersRevenue = createBalances()
  dailyHoldersRevenue.add(toStakers.clone(1, LABELS.STAKERS))
  dailyHoldersRevenue.add(toBuyback.clone(1, LABELS.BUYBACK))

  const dailyProtocolRevenue = toTreasury.clone(1, LABELS.TREASURY)

  const dailyRevenue = createBalances()
  dailyRevenue.add(toStakers)
  dailyRevenue.add(toBuyback)
  dailyRevenue.add(toTreasury)

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(1),
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: 'Volume of swaps on Motoswap pairs, read from the pair Swap events of every pair created by the Motoswap factory. Pairs quoted in MOTO are measured on their MOTO side, valued at the Motoswap MOTO/WETH pair price.',
  Fees: 'Every trade pays the pair swap fee (0.30%) to liquidity providers, a 0.70% Motoswap protocol fee on the quote side, and on coins that graduated from moto.fun a 0.30% creator fee.',
  UserFees: 'Traders pay all of the fees above.',
  Revenue: 'The part of the 0.70% protocol fee that goes to MOTO stakers, MOTO buyback and burn, and the treasury.',
  ProtocolRevenue: 'The treasury share of the 0.70% protocol fee.',
  HoldersRevenue: 'The share of the 0.70% protocol fee paid to MOTO stakers plus the share used to buy back and burn MOTO.',
  SupplySideRevenue: 'The 0.30% pair fee to liquidity providers, the creator fee to coin creators, and the Rakeback share of the protocol fee paid back to traders.',
}

const breakdownMethodology = {
  Fees: {
    [FEE_LABELS.LP]: 'Pair swap fee (factory swapFeeBps, 0.30% since launch), kept in the pair for liquidity providers.',
    [FEE_LABELS.PROTOCOL]: 'Motoswap protocol fee (FeeRouter protocolFeeBps, 0.70% since launch) taken once per trade on the quote side and sent to the Collector, from the FeeRouter Swap event feeAmount.',
    [FEE_LABELS.CREATOR]: 'Creator fee (0.30% since launch) on trades of coins graduated from moto.fun, from the FeeRouter CreatorFee event.',
  },
  UserFees: {
    [FEE_LABELS.LP]: 'Pair swap fee paid by traders.',
    [FEE_LABELS.PROTOCOL]: 'Motoswap protocol fee paid by traders.',
    [FEE_LABELS.CREATOR]: 'Creator fee paid by traders of graduated moto.fun coins.',
  },
  Revenue: {
    [LABELS.STAKERS]: 'MOTO stakers bucket of the Collector (2/7 of the protocol fee since launch).',
    [LABELS.BUYBACK]: 'Buyback and burn bucket of the Collector (1/7 of the protocol fee since launch), used to buy MOTO and burn it.',
    [LABELS.TREASURY]: 'Treasury bucket of the Collector (2/7 of the protocol fee since launch).',
  },
  ProtocolRevenue: {
    [LABELS.TREASURY]: 'Treasury bucket of the Collector (2/7 of the protocol fee since launch).',
  },
  HoldersRevenue: {
    [LABELS.STAKERS]: 'MOTO stakers bucket of the Collector (2/7 of the protocol fee since launch).',
    [LABELS.BUYBACK]: 'Buyback and burn bucket of the Collector (1/7 of the protocol fee since launch), used to buy MOTO and burn it.',
  },
  SupplySideRevenue: {
    [FEE_LABELS.TO_LPS]: 'Pair swap fee kept by liquidity providers.',
    [FEE_LABELS.TO_CREATORS]: 'Creator fee accrued to the coin creator in the CreatorFeeVault.',
    [LABELS.RAKEBACK]: 'Rakeback bucket of the Collector (2/7 of the protocol fee since launch), paid back to traders.',
  },
}

const uniV2Adapter: any = uniV2Exports({
  [CHAIN.ETHEREUM]: {
    factory: FACTORY,
    fees: HELPER_LP_FEE,
    customLogic,
    allowReadPairs: true,
    start: '2026-09-28',
  },
})
const uniV2Fetch = uniV2Adapter.adapter[CHAIN.ETHEREUM].fetch

// The first hours of 2026-09-28 are before the contracts existed: nothing traded, so every metric is zero.
const fetch = async (options: FetchOptions) => {
  if (await options.getToBlock() < DEPLOY_BLOCK) {
    const zero = options.createBalances()
    return { dailyVolume: zero, dailyFees: zero, dailyUserFees: zero, dailyRevenue: zero, dailyProtocolRevenue: zero, dailyHoldersRevenue: zero, dailySupplySideRevenue: zero }
  }
  return uniV2Fetch(options)
}

const adapter: SimpleAdapter = {
  ...uniV2Adapter,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2026-09-28' },
  },
  methodology,
  breakdownMethodology,
}

export default adapter
