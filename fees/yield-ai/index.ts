import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

// Yield AI vault package on Aptos mainnet. protocol::GlobalConfig at this address
// has perf_bps = 500 (5% performance fee) and treasury set to TREASURY.
// Verified on chain 2026-10-07. exec_bps is 0.
// https://explorer.aptoslabs.com/account/0x333d1890e0aa3762bb256f5caeeb142431862628c63063801f44c152ef154700
const PACKAGE = "0x333d1890e0aa3762bb256f5caeeb142431862628c63063801f44c152ef154700";
const TREASURY = "0x80cf20e44ac2aeb5d593e2bf9e0426b1e765deccec1c215700903eb7e8ebf1c6";
const ENTRY_PREFIX = `${PACKAGE}::vault::execute_`;

const APTOS_GRAPHQL = "https://api.mainnet.aptoslabs.com/v1/graphql";

// The indexer caps a response at 100 rows. Page by (transaction_version, event_index).
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const SIBLING_VERSION_BATCH = 15;

const DEPOSIT = "0x1::fungible_asset::Deposit";

// Gross claimed amount is reconstructed from fungible-asset deposits in the same
// transaction. The indexer no longer exposes an events table.
//
// "split": the treasury and the safe are paid as two deposits (the 5% cut and the
// 95% that stays). Gross is their sum. execute_hyperion_claim_fees and
// execute_hyperion_claim_rewards work this way (tx 7433576749, tx 7022004541).
//
// "gross": the full claim is deposited to the safe, then 5% is moved to the
// treasury. The safe deposit is already the gross. execute_claim_echelon
// (tx 7515493092), execute_claim_apt (tx 4342516904) and
// execute_hyperion_claim_campaign_rewards (tx 7027094973) work this way.
//
// "kept": a deposit the treasury receives in full, with no paired user share
// (dust left by execute_withdraw_full*). It is both fees and protocol revenue.
type CutKind = "split" | "gross" | "kept";

const ECHELON_REWARDS = "Echelon rewards";
const HYPERION_LP_FEES = "Hyperion LP fees";
const HYPERION_REWARDS = "Hyperion rewards";
const APT_CLAIM_REWARDS = "APT claim rewards";
const WITHDRAWAL_REMAINDER = "Withdrawal remainder";

const FEE_SOURCE: Record<string, { kind: CutKind; label: string }> = {
  [`${ENTRY_PREFIX}claim_echelon`]: { kind: "gross", label: ECHELON_REWARDS },
  [`${ENTRY_PREFIX}claim_apt`]: { kind: "gross", label: APT_CLAIM_REWARDS },
  [`${ENTRY_PREFIX}hyperion_claim_fees`]: { kind: "split", label: HYPERION_LP_FEES },
  [`${ENTRY_PREFIX}hyperion_claim_rewards`]: { kind: "split", label: HYPERION_REWARDS },
  [`${ENTRY_PREFIX}hyperion_claim_campaign_rewards`]: { kind: "gross", label: HYPERION_REWARDS },
  [`${ENTRY_PREFIX}withdraw_full`]: { kind: "kept", label: WITHDRAWAL_REMAINDER },
  [`${ENTRY_PREFIX}withdraw_full_as_owner`]: { kind: "kept", label: WITHDRAWAL_REMAINDER },
};

type Activity = {
  transaction_version: string;
  event_index: number;
  amount: string;
  asset_type: string;
  entry_function_id_str: string | null;
  owner_address: string;
};

const treasuryTo = (label: string) => `${label} To Treasury`;
const safesKeep = (label: string) => `${label} To Safes`;

function canonicalAsset(asset: string): string {
  const lower = asset.toLowerCase();
  if (!lower.startsWith("0x") || lower.includes("::")) return lower;
  const hex = lower.slice(2).replace(/^0+/, "") || "0";
  return `0x${hex}`;
}

function sameAddress(a: string, b: string): boolean {
  return canonicalAsset(a) === canonicalAsset(b);
}

function addAmount(map: Map<string, bigint>, key: string, amount: bigint) {
  map.set(key, (map.get(key) ?? 0n) + amount);
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      // The repo's Aptos helper does not attach an indexer key. Anonymous queries are
      // capped at 40k compute units / 5 min per IP, so use a key when one is configured.
      const headers: Record<string, string> = {};
      const apiKey = process.env.APTOS_API_KEY;
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const body = await httpPost(APTOS_GRAPHQL, { query, variables }, { headers });
      if (body?.errors?.length) {
        const message = body.errors.map((error: { message?: string }) => error.message).join("; ");
        if (attempt < 5 && /rate|limit|compute|408/i.test(message)) {
          await sleep(15000 * (attempt + 1));
          continue;
        }
        throw new Error(`yield-ai indexer: ${message}`);
      }
      return body.data as T;
    } catch (error) {
      lastError = error;
      const message = String((error as { message?: string })?.message ?? error);
      if (attempt < 5 && /408|429|rate|limit|timeout|ECONNRESET|socket/i.test(message)) {
        await sleep(15000 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const TREASURY_QUERY = `
  query YieldAiTreasuryDeposits(
    $owner: String!
    $from: timestamp!
    $to: timestamp!
    $prefix: String!
    $limit: Int!
    $cursorVersion: bigint!
    $cursorIndex: bigint!
  ) {
    fungible_asset_activities(
      where: {
        owner_address: { _eq: $owner }
        type: { _eq: "${DEPOSIT}" }
        is_gas_fee: { _eq: false }
        is_transaction_success: { _eq: true }
        entry_function_id_str: { _like: $prefix }
        transaction_timestamp: { _gte: $from, _lt: $to }
        _or: [
          { transaction_version: { _gt: $cursorVersion } }
          {
            transaction_version: { _eq: $cursorVersion }
            event_index: { _gt: $cursorIndex }
          }
        ]
      }
      order_by: [{ transaction_version: asc }, { event_index: asc }]
      limit: $limit
    ) {
      transaction_version
      event_index
      amount
      asset_type
      entry_function_id_str
      owner_address
    }
  }
`;

const SIBLING_QUERY = `
  query YieldAiClaimDeposits(
    $versions: [bigint!]!
    $limit: Int!
    $cursorVersion: bigint!
    $cursorIndex: bigint!
  ) {
    fungible_asset_activities(
      where: {
        transaction_version: { _in: $versions }
        type: { _eq: "${DEPOSIT}" }
        is_gas_fee: { _eq: false }
        is_transaction_success: { _eq: true }
        _or: [
          { transaction_version: { _gt: $cursorVersion } }
          {
            transaction_version: { _eq: $cursorVersion }
            event_index: { _gt: $cursorIndex }
          }
        ]
      }
      order_by: [{ transaction_version: asc }, { event_index: asc }]
      limit: $limit
    ) {
      transaction_version
      event_index
      amount
      asset_type
      owner_address
    }
  }
`;

async function pageTreasuryDeposits(fromIso: string, toIso: string): Promise<Activity[]> {
  const rows: Activity[] = [];
  let cursorVersion = "0";
  let cursorIndex = "-1";

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await gql<{ fungible_asset_activities: Activity[] }>(TREASURY_QUERY, {
      owner: TREASURY,
      from: fromIso,
      to: toIso,
      prefix: `${ENTRY_PREFIX}%`,
      limit: PAGE_SIZE,
      cursorVersion,
      cursorIndex,
    });
    const activities = data.fungible_asset_activities ?? [];
    rows.push(...activities);
    if (activities.length < PAGE_SIZE) return rows;
    const last = activities[activities.length - 1];
    cursorVersion = String(last.transaction_version);
    cursorIndex = String(last.event_index);
  }

  throw new Error(`yield-ai: more than ${MAX_PAGES * PAGE_SIZE} treasury deposits in one window`);
}

async function siblingDeposits(versions: string[]): Promise<Activity[]> {
  const rows: Activity[] = [];
  for (let i = 0; i < versions.length; i += SIBLING_VERSION_BATCH) {
    const batch = versions.slice(i, i + SIBLING_VERSION_BATCH);
    let cursorVersion = "0";
    let cursorIndex = "-1";
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await gql<{ fungible_asset_activities: Activity[] }>(SIBLING_QUERY, {
        versions: batch,
        limit: PAGE_SIZE,
        cursorVersion,
        cursorIndex,
      });
      const activities = data.fungible_asset_activities ?? [];
      rows.push(...activities);
      if (activities.length < PAGE_SIZE) break;
      const last = activities[activities.length - 1];
      cursorVersion = String(last.transaction_version);
      cursorIndex = String(last.event_index);
      if (page === MAX_PAGES - 1)
        throw new Error(`yield-ai: sibling deposits for versions ${batch[0]}.. did not fit in ${MAX_PAGES} pages`);
    }
  }
  return rows;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const fromIso = new Date(options.fromTimestamp * 1000).toISOString();
  const toIso = new Date(options.toTimestamp * 1000).toISOString();

  const treasuryRows = await pageTreasuryDeposits(fromIso, toIso);
  if (treasuryRows.length === 0) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
  }

  // version|asset -> summed treasury cut, and the entry function that paid it.
  const revenue = new Map<string, { fn: string; asset: string; amount: bigint }>();
  for (const row of treasuryRows) {
    const fn = row.entry_function_id_str ?? "";
    if (!FEE_SOURCE[fn])
      throw new Error(`yield-ai: treasury deposit from unclassified entry ${fn} in tx ${row.transaction_version}`);
    const asset = canonicalAsset(row.asset_type);
    const id = `${row.transaction_version}|${asset}`;
    const prev = revenue.get(id);
    const amount = BigInt(row.amount);
    if (prev && prev.fn !== fn)
      throw new Error(`yield-ai: tx ${row.transaction_version} paid the treasury from two entry functions`);
    revenue.set(id, { fn, asset, amount: (prev?.amount ?? 0n) + amount });
  }

  const versions = [...new Set(treasuryRows.map((row) => String(row.transaction_version)))];
  const siblings = await siblingDeposits(versions);
  const other = new Map<string, bigint>();
  for (const row of siblings) {
    if (sameAddress(row.owner_address, TREASURY)) continue;
    const asset = canonicalAsset(row.asset_type);
    addAmount(other, `${row.transaction_version}|${asset}`, BigInt(row.amount));
  }

  const fees = new Map<string, Map<string, bigint>>();
  const revenueByLabel = new Map<string, Map<string, bigint>>();
  const supplyByLabel = new Map<string, Map<string, bigint>>();

  const bump = (bucket: Map<string, Map<string, bigint>>, label: string, asset: string, amount: bigint) => {
    if (amount === 0n) return;
    let assets = bucket.get(label);
    if (!assets) {
      assets = new Map();
      bucket.set(label, assets);
    }
    addAmount(assets, asset, amount);
  };

  for (const [id, cut] of revenue) {
    const source = FEE_SOURCE[cut.fn];
    const userShare = other.get(id) ?? 0n;
    let gross: bigint;
    if (source.kind === "kept") {
      gross = cut.amount;
    } else if (userShare === 0n) {
      throw new Error(`yield-ai: tx ${id} (${cut.fn}) deposited to the treasury with no paired safe deposit`);
    } else if (source.kind === "split") {
      gross = userShare + cut.amount;
    } else {
      gross = userShare;
    }
    const supply = gross - cut.amount;
    if (supply < 0n)
      throw new Error(`yield-ai: supply side went negative for ${id} (${cut.fn})`);

    bump(fees, source.label, cut.asset, gross);
    bump(revenueByLabel, treasuryTo(source.label), cut.asset, cut.amount);
    bump(supplyByLabel, safesKeep(source.label), cut.asset, supply);
  }

  const write = (bucket: Map<string, Map<string, bigint>>, balances: ReturnType<FetchOptions["createBalances"]>) => {
    for (const [label, assets] of bucket) {
      for (const [asset, amount] of assets) balances.add(asset, amount.toString(), label);
    }
  };

  write(fees, dailyFees);
  write(revenueByLabel, dailyRevenue);
  write(supplyByLabel, dailySupplySideRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Gross value of rewards and LP fees claimed by the Yield AI vault executor: Echelon farming rewards (including the earlier execute_claim_apt path), Hyperion CLMM swap fees, and Hyperion farm and campaign rewards. The protocol takes 5% of each claim. Lending interest that accrues inside Echelon positions, and looping carry, are not charged and are not included. Counted when claimed, not as it accrues. Dust deposited to the treasury during a full withdrawal is included at the amount received.",
  Revenue: "The 5% performance fee (perf_bps = 500) deposited to the protocol treasury in the same vault::execute_* transaction that claims rewards or LP fees, plus any dust a full withdrawal deposits to that treasury.",
  ProtocolRevenue: "The same treasury deposits. Yield AI has no governance token, so the whole fee stays with the protocol treasury.",
  SupplySideRevenue: "The remaining 95% of each claimed reward and LP fee, which stays in the user's safe. Withdrawal dust kept by the treasury has no supply-side share.",
};

const breakdownMethodology = {
  Fees: {
    [ECHELON_REWARDS]: "Gross Echelon farming rewards claimed via vault::execute_claim_echelon, before the 5% performance fee.",
    [APT_CLAIM_REWARDS]: "Gross APT claimed via the earlier vault::execute_claim_apt, before the 5% performance fee.",
    [HYPERION_LP_FEES]: "Gross Hyperion CLMM swap fees claimed via vault::execute_hyperion_claim_fees (both pool legs), before the 5% performance fee.",
    [HYPERION_REWARDS]: "Gross Hyperion farm and campaign rewards claimed via vault::execute_hyperion_claim_rewards and vault::execute_hyperion_claim_campaign_rewards, before the 5% performance fee.",
    [WITHDRAWAL_REMAINDER]: "Fungible-asset dust deposited to the treasury inside vault::execute_withdraw_full and execute_withdraw_full_as_owner. The withdrawn principal is not a fee.",
  },
  Revenue: {
    [treasuryTo(ECHELON_REWARDS)]: "5% of claimed Echelon farming rewards deposited to the protocol treasury.",
    [treasuryTo(APT_CLAIM_REWARDS)]: "5% of APT claimed via execute_claim_apt, deposited to the protocol treasury.",
    [treasuryTo(HYPERION_LP_FEES)]: "5% of claimed Hyperion LP fees deposited to the protocol treasury.",
    [treasuryTo(HYPERION_REWARDS)]: "5% of claimed Hyperion farm and campaign rewards deposited to the protocol treasury.",
    [treasuryTo(WITHDRAWAL_REMAINDER)]: "Withdrawal dust deposited to the protocol treasury.",
  },
  ProtocolRevenue: {
    [treasuryTo(ECHELON_REWARDS)]: "5% of claimed Echelon farming rewards deposited to the protocol treasury.",
    [treasuryTo(APT_CLAIM_REWARDS)]: "5% of APT claimed via execute_claim_apt, deposited to the protocol treasury.",
    [treasuryTo(HYPERION_LP_FEES)]: "5% of claimed Hyperion LP fees deposited to the protocol treasury.",
    [treasuryTo(HYPERION_REWARDS)]: "5% of claimed Hyperion farm and campaign rewards deposited to the protocol treasury.",
    [treasuryTo(WITHDRAWAL_REMAINDER)]: "Withdrawal dust deposited to the protocol treasury.",
  },
  SupplySideRevenue: {
    [safesKeep(ECHELON_REWARDS)]: "95% of claimed Echelon farming rewards left in the user's safe.",
    [safesKeep(APT_CLAIM_REWARDS)]: "95% of APT claimed via execute_claim_apt left in the user's safe.",
    [safesKeep(HYPERION_LP_FEES)]: "95% of claimed Hyperion LP fees left in the user's safe.",
    [safesKeep(HYPERION_REWARDS)]: "95% of claimed Hyperion farm and campaign rewards left in the user's safe.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.APTOS],
  // First non-gas treasury deposit from vault::execute_* (execute_claim_apt, tx 4342516904).
  start: "2026-02-17",
  methodology,
  breakdownMethodology,
};

export default adapter;
