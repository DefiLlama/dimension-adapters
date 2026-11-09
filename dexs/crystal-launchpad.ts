import { CHAIN } from "../helpers/chains"
import { FetchOptions, SimpleAdapter } from "../adapters/types"

// Crystal singleton. launchpadParams() = (paused, initialNative, fee, creatorSplit, ...)
// fee and creatorSplit are the 3rd and 4th words. https://github.com/CrystalExch/Crystal-Contracts
const CRYSTAL = "0x508254c838B2e936B0631440c5C6E3AB3a4a98BD"
const FEE_DENOM = 100000n

const abi = {
  weth: 'function weth() view returns (address)',
  launchpadParams: 'function launchpadParams() view returns (bool,uint112,uint256,uint256,uint256,uint256,uint256,uint256)',
  LaunchpadTrade: 'event LaunchpadTrade(address indexed token, address indexed user, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 virtualNativeReserve, uint256 virtualTokenReserve)',
}

const fetch = async ({ api, getLogs, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const weth: string = await api.call({ target: CRYSTAL, abi: abi.weth })
  const params: any = await api.call({ target: CRYSTAL, abi: abi.launchpadParams })
  const feeBps = BigInt(params[2]) // retained fraction of a buy, in 1e5 (99000 = 1% fee)
  const creatorSplit = BigInt(params[3]) // percent of the fee paid to the token creator
  const spread = FEE_DENOM - feeBps
  const logs = await getLogs({ target: CRYSTAL, eventAbi: abi.LaunchpadTrade })
  for (const l of logs) {
    const amountIn = BigInt(l.amountIn)
    const amountOut = BigInt(l.amountOut)
    // Buys: amountIn is gross native in. Sells: amountOut is native out net of the fee.
    const feeAmt = l.isBuy ? amountIn * spread / FEE_DENOM : amountOut * spread / feeBps
    const protocolAmt = feeAmt * (100n - creatorSplit) / 100n
    dailyVolume.add(weth, (l.isBuy ? amountIn : amountOut).toString())
    dailyFees.add(weth, feeAmt.toString(), 'Bonding Curve Fees')
    dailyRevenue.add(weth, protocolAmt.toString(), 'Bonding Curve Fees To Protocol')
    dailySupplySideRevenue.add(weth, (feeAmt - protocolAmt).toString(), 'Bonding Curve Fees To Creators')
  }
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: "Native-token notional of launchpad bonding-curve buys and sells, before the token graduates to an orderbook or AMM market.",
  Fees: "Bonding-curve fee paid in the native token on every launchpad buy and sell.",
  UserFees: "Bonding-curve fee paid in the native token on every launchpad buy and sell.",
  Revenue: "Launchpad fee kept by Crystal after the token creator's split.",
  ProtocolRevenue: "Launchpad fee kept by Crystal after the token creator's split.",
  SupplySideRevenue: "Launchpad fee paid to the token creator.",
}

const breakdownMethodology = {
  Fees: {
    'Bonding Curve Fees': 'Native-token fee taken on each launchpad buy and sell.',
  },
  UserFees: {
    'Bonding Curve Fees': 'Native-token fee taken on each launchpad buy and sell.',
  },
  Revenue: {
    'Bonding Curve Fees To Protocol': 'Launchpad fee routed to the Crystal governance address.',
  },
  ProtocolRevenue: {
    'Bonding Curve Fees To Protocol': 'Launchpad fee routed to the Crystal governance address.',
  },
  SupplySideRevenue: {
    'Bonding Curve Fees To Creators': 'Launchpad fee paid to the token creator.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MONAD],
  start: "2026-09-19",
  methodology,
  breakdownMethodology,
}

export default adapter
