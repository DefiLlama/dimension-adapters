import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'

// Hot Take (usehottake.app): peer-to-peer social betting on X. Two users
// stake native USDC on opposite sides of a take; a market is created
// on-chain only once BOTH stakes are locked, and a judge (or the house
// judge) resolves it. ParimutuelV6 proxy on Base mainnet.
const HOT_TAKE = '0x64Be8f389E202a77b446C7E86B564F4122Cb5a66'

const abi = {
  // Fires once per bet, at the moment both stakes lock into escrow.
  MARKET_CREATED: 'event MarketCreated(uint64 indexed marketId, address indexed creator, string title, uint8 creatorOutcome, uint256 creatorAmount, uint256 takerAmount, address arbiter, uint256 arbiterFee, uint64 bettingDeadline, uint64 resolutionDeadline)',
  // Fires when the winner claims: carries the full fee split.
  CLAIMED: 'event Claimed(uint64 indexed marketId, address indexed winner, uint256 payout, uint256 protocolFee, uint256 arbiterFee)',
}

const FEE_LABELS = {
  PROTOCOL: 'Protocol fee on bet claim',
  JUDGE: 'Judge fee on bet claim',
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const created = await options.getLogs({ eventAbi: abi.MARKET_CREATED, target: HOT_TAKE })
  created.forEach((log: any) => {
    dailyVolume.addToken(ADDRESSES.base.USDC, log.creatorAmount)
    dailyVolume.addToken(ADDRESSES.base.USDC, log.takerAmount)
  })

  const protocolFees = options.createBalances()
  const judgeFees = options.createBalances()

  const claimed = await options.getLogs({ eventAbi: abi.CLAIMED, target: HOT_TAKE })
  claimed.forEach((log: any) => {
    protocolFees.addToken(ADDRESSES.base.USDC, log.protocolFee)
    judgeFees.addToken(ADDRESSES.base.USDC, log.arbiterFee)
  })

  dailyFees.addBalances(protocolFees, FEE_LABELS.PROTOCOL)
  dailyFees.addBalances(judgeFees, FEE_LABELS.JUDGE)
  dailyRevenue.addBalances(protocolFees, FEE_LABELS.PROTOCOL)
  dailySupplySideRevenue.addBalances(judgeFees, FEE_LABELS.JUDGE)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

const methodology = {
  Volume: 'USDC wagered: both stakes of every market at the moment they lock into escrow (a market is only created on-chain once fully matched). This is betting volume, not deposits — funding a balance is not counted, only money committed to a bet. Each dollar is counted exactly once: the two stakes come from two different bettors, so this is the pot, not the maker/taker double count an orderbook has to halve. Cancelled markets refund the stakes, but the matched notional stays counted, in line with other prediction markets.',
  Fees: 'Protocol fee plus judge fee, both charged on the pot when the winner claims.',
  Revenue: 'The protocol fee share of claims, paid to the protocol fee collector.',
  ProtocolRevenue: 'The protocol fee share of claims, paid to the protocol fee collector.',
  SupplySideRevenue: 'Judge fees paid to the human judges who resolve bets.',
  HoldersRevenue: 'Zero. There is no token.',
}

const breakdownMethodology = {
  Fees: {
    [FEE_LABELS.PROTOCOL]: 'Protocol fee taken from the pot when the winner claims (protocolFee on the Claimed event). The on-chain rate is 0 bps at launch, so this reads 0 until it is raised.',
    [FEE_LABELS.JUDGE]: 'Judge fee taken from the pot when the winner claims (arbiterFee on the Claimed event). Set per bet by the creator; 0 when the bet uses the house judge or names no fee.',
  },
  Revenue: {
    [FEE_LABELS.PROTOCOL]: 'The protocol fee share, paid to the protocol fee collector.',
  },
  SupplySideRevenue: {
    [FEE_LABELS.JUDGE]: 'Judge fees paid to the human judges who resolve bets.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  breakdownMethodology,
  chains: [CHAIN.BASE],
  methodology,
  // Contract deployed 2026-06-29T04:54:09Z (Base block 47959751); first
  // market created 2026-06-30.
  start: '2026-06-29',
}

export default adapter
