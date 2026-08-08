import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STREAM_LABELS: Record<string, string> = {
  staking_pool_creation: "Staking Pool Creation Fees",
  launchpad_sale_creation: "Launchpad Sale Creation Fees",
  launchpad_sale_commission: "Launchpad Sale Commission",
  locker_lock_creation: "Locker Lock Creation Fees",
  staking_rewards_commission: "Staking Reward Commission",
};

// The only recipient this API currently emits (confirmed on-chain per
// stream — see PR description). Checked explicitly, not assumed: the
// backend's RevenueEvent model reserves a second value ("creator") for a
// different, uncaptured commission mechanism, so an unrecognized value
// here means the API started publishing something this adapter hasn't
// been taught about yet, not that recipient checking is redundant.
const KNOWN_RECIPIENTS = new Set(["jvault"]);

// Per https://jvault.xyz/docs/ ("Revenue sharing system"), quoted exactly:
// "staking pools charge a commission in the form of a percentage of the
// rewards allocated to stakers ... and tokensales charge a commission in
// the form of a small percentage of the amount of funds raised. 50% of
// the commissions are converted into JVT and subsequently burned, while
// the other 50% is sent to the team's wallet." That sentence's "the
// commissions" refers back to these two PERCENTAGE-based commissions
// specifically — the three FLAT creation fees are introduced in the
// preceding sentence as "fixed fee[s]" with no burn/split language
// attached, so they are not split here.
//
// This is documented POLICY, not on-chain-enforced: the contract sends
// the full commission to the treasury in one transfer
// (staking_pool/main.fc's ADD_REWARDS handler; ico_sale.fc/sale_admin.fc's
// revenue_share splitter) — what happens to it afterward is JVault's own
// stated practice, unverifiable on-chain by this adapter. An EARLIER,
// different split (40% JVT conversion / 50% to JVT stakers / 10% team)
// is documented on the same page as a discontinued model, abandoned end
// of 2024 — do not resurrect those numbers if this policy changes again;
// re-check the docs page directly.
const BURN_SPLIT_STREAMS = new Set(["staking_rewards_commission", "launchpad_sale_commission"]);

type RevenueRow = {
  date: string;
  stream: string;
  token_address: string;
  recipient: string;
  amount: string;
};

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const res = await httpGet(`https://jvault.xyz/api/v1/revenue`, {
    params: { from: startTimestamp, to: endTimestamp },
  });

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  for (const row of res.rows as RevenueRow[]) {
    const label = STREAM_LABELS[row.stream];
    if (!label || !KNOWN_RECIPIENTS.has(row.recipient)) continue;

    dailyFees.add(row.token_address, row.amount, label);
    dailyRevenue.add(row.token_address, row.amount, label);

    if (BURN_SPLIT_STREAMS.has(row.stream)) {
      // Integer split: floor half to the burn side, the (possibly one
      // base-unit larger) remainder to the team side — the two always
      // sum back to the exact original amount, no dust lost either way.
      const total = BigInt(row.amount);
      const burnHalf = total / 2n;
      const teamHalf = total - burnHalf;
      dailyProtocolRevenue.add(row.token_address, teamHalf.toString(), label);
      dailyHoldersRevenue.add(row.token_address, burnHalf.toString(), label);
    } else {
      dailyProtocolRevenue.add(row.token_address, row.amount, label);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const breakdown: Record<string, string> = {
  "Staking Pool Creation Fees":
    "Flat JVT fee charged when a staking pool is deployed via JVault's PoolFactory, sent to JVault's treasury on deploy.",
  "Launchpad Sale Creation Fees":
    "Flat JVT fee charged when a token sale is deployed via the JVault Launchpad, sent to JVault's treasury on deploy.",
  "Launchpad Sale Commission":
    "0.5%-2% of TON raised (tiered by amount raised), charged once a Launchpad sale completes successfully. Per JVault's docs, split 50% converted to JVT and burned / 50% to the team wallet.",
  "Locker Lock Creation Fees":
    "Flat TON fee charged when a vesting/lock contract is deployed via JVault Locker, sent to JVault's treasury on deploy.",
  "Staking Reward Commission":
    "A percentage skimmed off every reward-jetton deposit a staking pool's creator makes, sent directly to JVault's treasury by the ADD_REWARDS handler itself (staking_pool/main.fc). Per JVault's docs, split 50% converted to JVT and burned / 50% to the team wallet.",
};

const protocolRevenueBreakdown: Record<string, string> = {
  "Staking Pool Creation Fees": breakdown["Staking Pool Creation Fees"],
  "Launchpad Sale Creation Fees": breakdown["Launchpad Sale Creation Fees"],
  "Locker Lock Creation Fees": breakdown["Locker Lock Creation Fees"],
  "Launchpad Sale Commission": "The 50% of this commission NOT converted to JVT and burned — sent to JVault's team wallet.",
  "Staking Reward Commission": "The 50% of this commission NOT converted to JVT and burned — sent to JVault's team wallet.",
};

const holdersRevenueBreakdown: Record<string, string> = {
  "Launchpad Sale Commission": "50% of this commission, converted to JVT and burned — a buyback-and-burn benefiting all JVT holders.",
  "Staking Reward Commission": "50% of this commission, converted to JVT and burned — a buyback-and-burn benefiting all JVT holders.",
};

const methodology = {
  Fees: "Every fee/commission JVault's mechanisms extract: flat creation fees on staking pools, launchpad sales and locker vesting contracts, the launchpad's end-of-sale commission, and the percentage skimmed off staking-pool reward deposits.",
  Revenue: "Identical to Fees — every stream currently tracked lands on JVault's own treasury in a single on-chain transfer; there is no supply-side (LP/staker/creator) cut in any of them. Revenue = ProtocolRevenue + HoldersRevenue.",
  ProtocolRevenue: "The three flat creation fees in full, plus 50% of each percentage-based commission (the half JVault's team wallet keeps rather than converting to JVT and burning), per jvault.xyz/docs's documented policy.",
  HoldersRevenue: "50% of each percentage-based commission (staking reward commission, launchpad sale commission), converted to JVT and burned per JVault's documented policy — a buyback-and-burn benefiting all JVT holders. Not on-chain-enforced; see the adapter source comment.",
};

const breakdownMethodology = {
  Fees: breakdown,
  Revenue: breakdown,
  ProtocolRevenue: protocolRevenueBreakdown,
  HoldersRevenue: holdersRevenueBreakdown,
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TON],
  // Earliest event JVault's own ledger has backfilled and verified
  // (a Launchpad sale-creation fee). See PR description for the
  // verification methodology.
  start: "2024-06-07",
  methodology,
  breakdownMethodology,
};

export default adapter;
