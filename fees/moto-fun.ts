import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { LABELS, WETH, getCollectorSplit, splitProtocolFees } from "../helpers/motoswap";

// moto.fun: the token launchpad of Motoswap on Ethereum, live since 2026-09-28. https://moto.fun
// One contract, the LaunchpadCurve (UUPS proxy), runs every coin's bonding curve. Each buy and sell pays
// protocolFeeBps (70 bps at launch) to the Motoswap Collector and creatorFeeBps (50 bps at launch) to the
// CreatorFeeVault for the coin's creator, both in WETH. The Trade event carries both amounts.
// At graduation a coin moves to Motoswap pairs; its trading there is counted by the motoswap adapter.
// LaunchpadCurve https://etherscan.io/address/0xb65b67e986d7B097652920d72202F2c78319BC2C
const CURVE = '0xb65b67e986d7B097652920d72202F2c78319BC2C'
const CURVE_DEPLOY_BLOCK = 26075451 // 2026-09-28, about 10:47 UTC

// ethAmount: curve-leg gross ETH (fees included on buys, before fees on sells)
const TRADE_EVENT = 'event Trade(address indexed trader, address indexed token, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 priceX18, uint256 protocolFee, uint256 creatorFee)'

const FEE_LABELS = {
  PROTOCOL: 'Bonding Curve Protocol Fees',
  CREATOR: METRIC.CREATOR_FEES,
  TO_CREATORS: 'Creator Fees To Coin Creators',
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const protocolFees = options.createBalances()
  const creatorFees = options.createBalances()

  // The first hours of 2026-09-28 are before the curve existed: nothing traded, so every metric is zero.
  if (await options.getToBlock() < CURVE_DEPLOY_BLOCK) {
    return { dailyVolume, dailyFees: protocolFees, dailyUserFees: protocolFees, dailyRevenue: protocolFees, dailyProtocolRevenue: protocolFees, dailyHoldersRevenue: protocolFees, dailySupplySideRevenue: protocolFees }
  }

  const trades = await options.getLogs({ target: CURVE, eventAbi: TRADE_EVENT })
  for (const trade of trades) {
    dailyVolume.add(WETH, trade.ethAmount)
    protocolFees.add(WETH, trade.protocolFee, FEE_LABELS.PROTOCOL)
    creatorFees.add(WETH, trade.creatorFee, FEE_LABELS.CREATOR)
  }

  const split = await getCollectorSplit(options)
  const { toStakers, toBuyback, toTreasury, toRakeback } = splitProtocolFees(protocolFees, split)

  const dailyFees = options.createBalances()
  dailyFees.add(protocolFees.clone(1, FEE_LABELS.PROTOCOL))
  dailyFees.add(creatorFees.clone(1, FEE_LABELS.CREATOR))

  const dailySupplySideRevenue = options.createBalances()
  dailySupplySideRevenue.add(creatorFees.clone(1, FEE_LABELS.TO_CREATORS))

  const dailyHoldersRevenue = options.createBalances()
  dailyHoldersRevenue.add(toStakers.clone(1, LABELS.STAKERS))
  dailyHoldersRevenue.add(toBuyback.clone(1, LABELS.BUYBACK))

  const dailyProtocolRevenue = options.createBalances()
  dailyProtocolRevenue.add(toTreasury.clone(1, LABELS.TREASURY))
  dailyProtocolRevenue.add(toRakeback.clone(1, LABELS.RAKEBACK))

  const dailyRevenue = options.createBalances()
  dailyRevenue.add(toStakers)
  dailyRevenue.add(toBuyback)
  dailyRevenue.add(toTreasury)
  dailyRevenue.add(toRakeback)

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
  Volume: 'ETH traded on the moto.fun bonding curves (buys and sells before graduation).',
  Fees: 'Every bonding curve trade pays 1.20%: a 0.70% protocol fee to Motoswap and a 0.50% fee to the coin creator.',
  UserFees: 'Traders pay the full 1.20% fee.',
  Revenue: 'The whole 0.70% protocol fee: the shares for MOTO stakers, MOTO buyback and burn, the treasury and the Rakeback program.',
  ProtocolRevenue: 'The treasury share and the Rakeback program share of the 0.70% protocol fee.',
  HoldersRevenue: 'The share of the 0.70% protocol fee paid to MOTO stakers plus the share used to buy back and burn MOTO.',
  SupplySideRevenue: 'The 0.50% creator fee to coin creators.',
}

const breakdownMethodology = {
  Fees: {
    [FEE_LABELS.PROTOCOL]: 'Protocol fee (curve protocolFeeBps, 0.70% since launch) sent to the Motoswap Collector, from the Trade event protocolFee.',
    [FEE_LABELS.CREATOR]: 'Creator fee (curve creatorFeeBps, 0.50% since launch) accrued to the coin creator, from the Trade event creatorFee.',
  },
  UserFees: {
    [FEE_LABELS.PROTOCOL]: 'Protocol fee paid by traders.',
    [FEE_LABELS.CREATOR]: 'Creator fee paid by traders.',
  },
  Revenue: {
    [LABELS.STAKERS]: 'MOTO stakers bucket of the Collector (2/7 of the protocol fee since launch).',
    [LABELS.BUYBACK]: 'Buyback and burn bucket of the Collector (1/7 of the protocol fee since launch), used to buy MOTO and burn it.',
    [LABELS.TREASURY]: 'Treasury bucket of the Collector (2/7 of the protocol fee since launch).',
    [LABELS.RAKEBACK]: 'Rakeback bucket of the Collector (2/7 of the protocol fee since launch). Rakeback is a protocol-run program funded out of the protocol fee, so like token incentives it is spent from revenue, not a supply-side payment.',
  },
  ProtocolRevenue: {
    [LABELS.TREASURY]: 'Treasury bucket of the Collector (2/7 of the protocol fee since launch).',
    [LABELS.RAKEBACK]: 'Rakeback bucket of the Collector (2/7 of the protocol fee since launch). Rakeback is a protocol-run program funded out of the protocol fee, so like token incentives it is spent from revenue, not a supply-side payment.',
  },
  HoldersRevenue: {
    [LABELS.STAKERS]: 'MOTO stakers bucket of the Collector (2/7 of the protocol fee since launch).',
    [LABELS.BUYBACK]: 'Buyback and burn bucket of the Collector (1/7 of the protocol fee since launch), used to buy MOTO and burn it.',
  },
  SupplySideRevenue: {
    [FEE_LABELS.TO_CREATORS]: 'Creator fee accrued to the coin creator in the CreatorFeeVault.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2026-09-28',
  methodology,
  breakdownMethodology,
}

export default adapter
