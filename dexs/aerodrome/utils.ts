import * as sdk from '@defillama/sdk';
import { FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

// Aero upgrade (https://aero.xyz/aero-upgrade/): Aerodrome and Velodrome merged into Aero at
// 2026-10-22 00:00 UTC. The legacy pools keep trading on every chain, but their gauges stopped
// passing swap fees to voters before that. Last fee distribution per chain (latest gauge
// periodFinish minus one week; on Base and Optimism the last ClaimFees/CollectFees landed at
// 2026-10-15 00:07 UTC). Fees earned by staked liquidity after it were never distributed: they stay
// locked in the gauges, all killed for the upgrade on 2026-10-21 23:38-23:41 UTC, which the Aero
// Foundation plans to reactivate to reclaim them, so from then on they count as protocol revenue.
const VOTER_FEES_END: Record<string, string> = {
  [CHAIN.BASE]: '2026-10-15',
  [CHAIN.OPTIMISM]: '2026-10-15',
  [CHAIN.INK]: '2026-10-15',
  [CHAIN.UNICHAIN]: '2026-09-24',
  [CHAIN.FRAXTAL]: '2026-09-24',
  [CHAIN.SONEIUM]: '2026-09-24',
  [CHAIN.CELO]: '2026-09-24',
  [CHAIN.LISK]: '2026-07-16',
  [CHAIN.MODE]: '2026-06-18',
}
// Voting, and with it bribes, ran until the upgrade.
const AERO_LAUNCH = 1792627200 // 2026-10-22 00:00 UTC
export const LOCKED_GAUGE_FEES = 'Staked-LP Fees Locked In Deactivated Gauges'
export const bribesEnded = (options: FetchOptions) => options.endTimestamp > AERO_LAUNCH
const voterFeesEnded = (options: FetchOptions) => {
  const end = VOTER_FEES_END[options.chain]
  return !!end && options.endTimestamp > Date.parse(end) / 1000
}

// Revenue exports of a legacy adapter: the staked-liquidity fee share goes to voters until the
// chain's last fee distribution and to protocol revenue (locked) after it; bribes stay with voters.
export const legacyRevenueExports = (options: FetchOptions, stakedFees: sdk.Balances, stakedFeesLabel: string, bribes?: sdk.Balances, bribesLabel?: string) => {
  const holders = options.createBalances()
  const locked = options.createBalances()
  if (voterFeesEnded(options)) locked.add(stakedFees, LOCKED_GAUGE_FEES)
  else holders.add(stakedFees, stakedFeesLabel)
  if (bribes && bribesLabel) holders.add(bribes, bribesLabel)
  const revenue = holders.clone()
  revenue.add(locked)
  return { dailyRevenue: revenue, dailyHoldersRevenue: holders, dailyProtocolRevenue: locked }
}

// ---------------------------------------------------------------------------
// Aero Ignition pre-launch token pricing
// ---------------------------------------------------------------------------
// Aerodrome's "Ignition" launchpad lets a project deposit bribes/incentives
// denominated in its own token *before* that token trades. Those bribes show up
// as NotifyReward events and feed BribesRevenue, but DefiLlama has no market
// price for the token until it launches - so for the pre-launch window we value
// the bribes with a manually supplied price instead.
//
// Each Ignition launch is announced on-chain by the IgnitionRegistry
// (0xb92ad5cd5a94242aea076918f6fd4394867ccbbb) via:
//   IgnitionEvent(address token, address pool, address incentive, uint256 initial_incentive_epoch_timestamp)
// `token` is the entry key below. Note the event's timestamp is when the
// incentive epoch *starts* (pre-launch bribes begin), NOT when the token starts
// trading - those can be days to weeks apart - so the event cannot give us the
// `tradesFrom` date or the price. Both are set by hand here. Not every
// pre-launch token comes through this registry (e.g. 0x8e4c... did not), so this
// map is the source of truth, maintained manually.
//
// To add a new launch:
//   1. token       - the IgnitionEvent `token` address, lowercased, as the key.
//   2. decimals     - the token's ERC20 decimals (almost always 18).
//   3. conversionRate - the token's USD price during the pre-launch window
//                       (use the launch-day VWAP; the event carries no price).
//   4. tradesFrom   - 'YYYY-MM-DD' (UTC) of the first day DefiLlama prices the
//                     token reliably, i.e. the day after launch. Before this date
//                     bribes use `conversionRate`; on/after it they use spot.
export const PRE_LAUNCH_TOKEN_PRICING: any = {
  '0x11dc28d01984079b7efe7763b533e6ed9e3722b9': {
    decimals: 18,
    conversionRate: 1.5887,
    tradesFrom: '2025-09-19'
  },
  '0xf732a566121fa6362e9e0fbdd6d66e5c8c925e49': {
    decimals: 18,
    conversionRate: 0.15,
    tradesFrom: '2025-10-30'
  },
  '0x9126236476efba9ad8ab77855c60eb5bf37586eb': {
    decimals: 18,
    conversionRate: 0.025,
    tradesFrom: '2025-12-20'
  },
  '0x194f360d130f2393a5e9f3117a6a1b78abea1624': {
    decimals: 18,
    conversionRate: 0.01208,
    tradesFrom: '2026-01-23'
  },
  '0x8e4cbbcc33db6c0a18561fde1f6ba35906d4848b': {
    decimals: 18,
    conversionRate: 0.07245,
    tradesFrom: '2026-04-02'
  },
  '0x6e84030fa86ebf585e3e18fe557e5612f7e93bff': {
    decimals: 18,
    conversionRate: 0.06,
    tradesFrom: '2026-05-14'
  },
  '0xa1a0b2e02b0e6830ad5a4a7211691200945d8919': {
    decimals: 18,
    conversionRate: 0.00015,
    tradesFrom: '2026-06-05'
  },
  // Hunter Biden's Laptop ($LAPTOP), launched on Base on 2026-09-09.
  '0xb095274743941e953c746f9c228da9c18bb6ec29': {
    decimals: 18,
    conversionRate: 1.86,
    tradesFrom: '2026-09-10'
  }
}

// Pricing rule for tokens in PRE_LAUNCH_TOKEN_PRICING:
//   currentTimestamp <  tradesFrom  -> hardcoded conversionRate (token has no market price yet)
//   currentTimestamp >= tradesFrom  -> DefiLlama spot price via balances.add (token is live)
// Tokens not in the map always use balances.add.
export const handleBribeToken = (
  token: string,
  amount: string,
  currentTimestamp: number,
  dailyBribesRevenue: sdk.Balances
): void => {
  const tokenConfig = PRE_LAUNCH_TOKEN_PRICING[token.toLowerCase()]
  const tradesFromTimestamp = tokenConfig && Date.parse(tokenConfig.tradesFrom) / 1000

  if (!tokenConfig || currentTimestamp >= tradesFromTimestamp) {
    dailyBribesRevenue.add(token, amount)
    return
  }

  const convertedAmount = (Number(amount) * tokenConfig.conversionRate) / (10 ** tokenConfig.decimals)
  dailyBribesRevenue.addUSDValue(convertedAmount)
}
