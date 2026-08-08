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
  recipient: "jvault" | "creator";
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
  const dailySupplySideRevenue = options.createBalances();

  for (const row of res.rows as RevenueRow[]) {
    const token = row.token_address === TON_NATIVE ? TON_NATIVE : row.token_address;
    const label = STREAM_LABELS[row.stream] ?? row.stream;

    dailyFees.add(token, row.amount, label);
    if (row.recipient === "jvault") {
      // Every stream that reaches JVault's own treasury does so in full —
      // there is no buyback/burn/token-holder distribution mechanism, so
      // Revenue and ProtocolRevenue are identical here.
      dailyRevenue.add(token, row.amount, label);
      dailyProtocolRevenue.add(token, row.amount, label);
    } else {
      // recipient === "creator": the individual staking-pool's own
      // creator, claimed via a creator-gated on-chain op — not JVault's
      // revenue, but still money the mechanism extracts (counts in Fees).
      dailySupplySideRevenue.add(token, row.amount, label);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const breakdown: Record<string, string> = {
  "Staking Pool Creation Fees":
    "Flat JVT fee charged when a staking pool is deployed via JVault's PoolFactory.",
  "Launchpad Sale Creation Fees":
    "Flat JVT fee charged when a token sale is deployed via the JVault Launchpad.",
  "Launchpad Sale Commission":
    "0.5%-2% of TON raised (tiered by amount raised), charged once a Launchpad sale completes successfully.",
  "Locker Lock Creation Fees":
    "Flat TON fee charged when a vesting/lock contract is deployed via JVault Locker.",
  "Staking Reward Commission":
    "The percentage an individual staking pool's own creator charges on their own reward deposits to that pool — paid to the pool's creator, never to JVault.",
};

const jvaultBreakdown = {
  "Staking Pool Creation Fees": breakdown["Staking Pool Creation Fees"],
  "Launchpad Sale Creation Fees": breakdown["Launchpad Sale Creation Fees"],
  "Launchpad Sale Commission": breakdown["Launchpad Sale Commission"],
  "Locker Lock Creation Fees": breakdown["Locker Lock Creation Fees"],
};

const methodology = {
  Fees: "Every fee/commission JVault's mechanisms extract: flat creation fees on staking pools, launchpad sales and locker vesting contracts, the launchpad's end-of-sale commission, and the percentage individual staking-pool creators charge on their own reward deposits.",
  Revenue: "JVault's own share, collected by its treasury: creation fees (staking, launchpad, locker) and the launchpad's end-of-sale commission. Excludes the per-pool reward commission, which is paid to that pool's own creator, not to JVault.",
  ProtocolRevenue: "Identical to Revenue — every JVault-bound fee lands on a single treasury address; none of it is distributed to token holders.",
  SupplySideRevenue: "The percentage individual staking-pool creators charge on their own reward deposits, claimed via a creator-gated on-chain op — not JVault's revenue.",
};

const breakdownMethodology = {
  Fees: breakdown,
  Revenue: jvaultBreakdown,
  ProtocolRevenue: jvaultBreakdown,
  SupplySideRevenue: { "Staking Reward Commission": breakdown["Staking Reward Commission"] },
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
