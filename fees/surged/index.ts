import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Deployed addresses: https://api.surged.fun/config and https://explorer.arc.io/address/0x2667997e44F01933Db7F612FB8a53aC3Ad0bba7e
const FACTORY = "0x2667997e44F01933Db7F612FB8a53aC3Ad0bba7e"
const V3_FEE_COLLECTOR = "0x328fdD261570c03Acbcb25E21fcAcF082BCcDaf4"
const FACTORY_DEPLOYED_BLOCK = 21164125
const BPS = 10000n

const TOKEN_LAUNCHED_EVENT = "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold, uint256 launchBlock)"
// quoteIn is the gross amount the buyer spent: fee, creator tax and snipe tax are taken out of it
const CURVE_BOUGHT_EVENT = "event CurveBought(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 creatorTax, uint256 snipeTax)"
// quoteOut is what the seller received, after fee and creator tax
const CURVE_SOLD_EVENT = "event CurveSold(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 creatorTax)"
// Graduated Uniswap v3 positions are locked; their LP fees are collected and split by this event
const POOL_FEES_SWEPT_EVENT = "event PoolFeesSwept(bytes32 indexed poolId, address currency, uint256 protocolAmount, uint256 creatorAmount)"

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const launches = await options.getLogs({
    target: FACTORY,
    eventAbi: TOKEN_LAUNCHED_EVENT,
    fromBlock: FACTORY_DEPLOYED_BLOCK,
    cacheInCloud: true,
  })
  const launchesInPeriod = await options.getLogs({ target: FACTORY, eventAbi: TOKEN_LAUNCHED_EVENT })

  // Every launch pays the factory's launch fee in native USDC, credited in full to the protocol fee recipient
  if (launchesInPeriod.length) {
    const launchFee = await options.toApi.call({ target: FACTORY, abi: "uint256:launchFee" })
    const launchFees = BigInt(launchFee) * BigInt(launchesInPeriod.length)
    dailyFees.addGasToken(launchFees, "Launch Fees")
    dailyRevenue.addGasToken(launchFees, "Launch Fees to Protocol")
  }

  const curves: string[] = launches.map((l: any) => l.curve.toLowerCase())
  if (curves.length) {
    const curveToPairToken = new Map<string, string>(launches.map((l: any) => [l.curve.toLowerCase(), l.pairToken]))
    const buys = await options.getLogs({ targets: curves, eventAbi: CURVE_BOUGHT_EVENT, entireLog: true, parseLog: true })
    const sells = await options.getLogs({ targets: curves, eventAbi: CURVE_SOLD_EVENT, entireLog: true, parseLog: true })

    // The protocol share of the curve fee is frozen per curve at launch (30% at deployment)
    const tradedCurves = [...new Set([...buys, ...sells].map((log: any) => log.address.toLowerCase()))]
    const shares = await options.api.multiCall({ abi: "uint16:protocolFeeShareBps", calls: tradedCurves })
    const protocolShare = new Map<string, bigint>(tradedCurves.map((curve, i) => [curve, BigInt(shares[i])]))

    const addTrade = (curve: string, volume: bigint, fee: bigint, creatorTax: bigint, snipeTax: bigint) => {
      const pairToken = curveToPairToken.get(curve)!
      const share = protocolShare.get(curve)!
      dailyVolume.add(pairToken, volume)

      dailyFees.add(pairToken, fee, "Curve Trading Fees")
      dailyFees.add(pairToken, snipeTax, "Snipe Tax")
      dailyFees.add(pairToken, creatorTax, METRIC.CREATOR_FEES)

      // Base fee and snipe tax split between protocol and creator by the curve's share; creator tax is all creator
      dailyRevenue.add(pairToken, fee * share / BPS, "Curve Trading Fees to Protocol")
      dailyRevenue.add(pairToken, snipeTax * share / BPS, "Snipe Tax to Protocol")
      dailySupplySideRevenue.add(pairToken, fee - fee * share / BPS, "Curve Trading Fees to Creators")
      dailySupplySideRevenue.add(pairToken, snipeTax - snipeTax * share / BPS, "Snipe Tax to Creators")
      dailySupplySideRevenue.add(pairToken, creatorTax, "Creator Tax to Creators")
    }

    for (const log of buys) {
      const { quoteIn, fee, creatorTax, snipeTax } = log.args
      addTrade(log.address.toLowerCase(), BigInt(quoteIn), BigInt(fee), BigInt(creatorTax), BigInt(snipeTax))
    }
    for (const log of sells) {
      const { quoteOut, fee, creatorTax } = log.args
      const volume = BigInt(quoteOut) + BigInt(fee) + BigInt(creatorTax)
      addTrade(log.address.toLowerCase(), volume, BigInt(fee), BigInt(creatorTax), 0n)
    }
  }

  // Fees from graduated pools are realised when swept, in both the pair token and the launched token.
  // currency is the zero address for native USDC.
  const sweeps = await options.getLogs({ target: V3_FEE_COLLECTOR, eventAbi: POOL_FEES_SWEPT_EVENT })
  for (const { currency, protocolAmount, creatorAmount } of sweeps) {
    dailyFees.add(currency, BigInt(protocolAmount) + BigInt(creatorAmount), METRIC.SWAP_FEES)
    dailyRevenue.add(currency, protocolAmount, "Token Swap Fees to Protocol")
    dailySupplySideRevenue.add(currency, creatorAmount, "Token Swap Fees to Creators")
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: "Volume of all buys and sells on Surged bonding curves. Swaps in graduated Uniswap pools are excluded.",
  Fees: "Launch fees, curve trading fees, snipe tax, creator tax and swap fees from graduated Uniswap v3 pools (realised when swept).",
  Revenue: "All launch fees plus the protocol share of curve trading fees, snipe tax and graduated pool swap fees.",
  ProtocolRevenue: "All revenue goes to the protocol fee recipient.",
  SupplySideRevenue: "The creator share of curve trading fees, snipe tax and graduated pool swap fees, plus the full creator tax.",
}

const breakdownMethodology = {
  Fees: {
    "Launch Fees": "Fee paid in USDC for every token launched (1 USDC at deployment).",
    "Curve Trading Fees": "Base fee on every buy and sell on the bonding curve (1% at deployment).",
    "Snipe Tax": "Tax on buys in the first blocks after a launch, decaying block by block to zero.",
    [METRIC.CREATOR_FEES]: "Optional tax set by the creator on curve buys and sells, capped at 10%.",
    [METRIC.SWAP_FEES]: "LP fees earned by the locked Uniswap v3 position of a graduated token, realised when swept.",
  },
  Revenue: {
    "Launch Fees to Protocol": "All launch fees go to the protocol.",
    "Curve Trading Fees to Protocol": "Protocol share of the curve trading fees (30% at deployment).",
    "Snipe Tax to Protocol": "Protocol share of the snipe tax (30% at deployment).",
    "Token Swap Fees to Protocol": "Protocol share of the graduated pool swap fees (30% at deployment).",
  },
  ProtocolRevenue: {
    "Launch Fees to Protocol": "All launch fees go to the protocol.",
    "Curve Trading Fees to Protocol": "Protocol share of the curve trading fees (30% at deployment).",
    "Snipe Tax to Protocol": "Protocol share of the snipe tax (30% at deployment).",
    "Token Swap Fees to Protocol": "Protocol share of the graduated pool swap fees (30% at deployment).",
  },
  SupplySideRevenue: {
    "Curve Trading Fees to Creators": "Creator share of the curve trading fees (70% at deployment).",
    "Snipe Tax to Creators": "Creator share of the snipe tax (70% at deployment).",
    "Creator Tax to Creators": "The full creator tax goes to the token creator.",
    "Token Swap Fees to Creators": "Creator share of the graduated pool swap fees (70% at deployment).",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  methodology,
  breakdownMethodology,
  start: "2026-09-16",
}

export default adapter;
