import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Same TON-native pseudo-address JVault's own public API and price cache
// use for Toncoin (mirrors fees/swap-coffee/index.ts on this same chain).
const TON_NATIVE = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

const STREAM_LABELS: Record<string, string> = {
  staking_pool_creation: "Staking Pool Creation Fees",
  launchpad_sale_creation: "Launchpad Sale Creation Fees",
  launchpad_sale_commission: "Launchpad Sale Commission",
  locker_lock_creation: "Locker Lock Creation Fees",
  staking_rewards_commission: "Staking Reward Commission",
};

type RevenueRow = {
  date: string;
  stream: string;
  token_address: string;
  recipient: "jvault";
  amount: string;
};

// All five streams land on JVault's own treasury — confirmed on-chain per
// stream (see PR description). There is currently no supply-side/creator
// cut to track: staking_rewards_commission looked like one at first glance
// (a percentage a pool's own creator sets), but the ADD_REWARDS handler
// sends it straight to the pool factory's admin address at deposit time
// (staking_pool/main.fc — the transfer's own on-chain comment reads
// "JVault's rewards commission"), not to the creator.
const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const res = await httpGet(`https://jvault.xyz/api/v1/revenue`, {
    params: { from: startTimestamp, to: endTimestamp },
  });

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  for (const row of res.rows as RevenueRow[]) {
    const label = STREAM_LABELS[row.stream] ?? row.stream;
    dailyFees.add(row.token_address, row.amount, label);
    dailyRevenue.add(row.token_address, row.amount, label);
    dailyProtocolRevenue.add(row.token_address, row.amount, label);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const breakdown: Record<string, string> = {
  "Staking Pool Creation Fees":
    "Flat JVT fee charged when a staking pool is deployed via JVault's PoolFactory, sent to JVault's treasury on deploy.",
  "Launchpad Sale Creation Fees":
    "Flat JVT fee charged when a token sale is deployed via the JVault Launchpad, sent to JVault's treasury on deploy.",
  "Launchpad Sale Commission":
    "0.5%-2% of TON raised (tiered by amount raised), charged once a Launchpad sale completes successfully and sent to JVault's treasury.",
  "Locker Lock Creation Fees":
    "Flat TON fee charged when a vesting/lock contract is deployed via JVault Locker, sent to JVault's treasury on deploy.",
  "Staking Reward Commission":
    "A percentage skimmed off every reward-jetton deposit a staking pool's creator makes, sent directly to JVault's treasury by the ADD_REWARDS handler itself (staking_pool/main.fc).",
};

const methodology = {
  Fees: "Every fee/commission JVault's mechanisms extract: flat creation fees on staking pools, launchpad sales and locker vesting contracts, the launchpad's end-of-sale commission, and the percentage skimmed off staking-pool reward deposits.",
  Revenue: "Identical to Fees — every stream currently tracked lands on JVault's own treasury; there is no supply-side (LP/staker/creator) cut in any of them.",
  ProtocolRevenue: "Identical to Revenue — all of it lands on a single treasury address; none is distributed to token holders.",
};

const breakdownMethodology = {
  Fees: breakdown,
  Revenue: breakdown,
  ProtocolRevenue: breakdown,
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON],
  // Earliest event JVault's own ledger has backfilled and verified
  // (a Launchpad sale-creation fee). See PR description for the
  // verification methodology.
  start: "2024-06-07",
  pullHourly: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
