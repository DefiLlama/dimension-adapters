import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import { CHAIN } from "../../helpers/chains";

// Yield AI vault package on Aptos mainnet. protocol::GlobalConfig at this address
// has perf_bps = 500 (5% performance fee) and treasury set to TREASURY.
// Verified on chain 2026-10-07. exec_bps is 0.
// https://explorer.aptoslabs.com/account/0x333d1890e0aa3762bb256f5caeeb142431862628c63063801f44c152ef154700
const PACKAGE = "0x333d1890e0aa3762bb256f5caeeb142431862628c63063801f44c152ef154700";
const TREASURY = "0x80cf20e44ac2aeb5d593e2bf9e0426b1e765deccec1c215700903eb7e8ebf1c6";
const ENTRY_PREFIX = `${PACKAGE}::vault::execute_`;

// Gross claimed amount is reconstructed from fungible-asset deposits in the same
// transaction (Allium aptos.assets.fungible_transfers, one row per deposit event).
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

const treasuryTo = (label: string) => `${label} To Treasury`;
const safesKeep = (label: string) => `${label} To Safes`;

type ClaimRow = {
  transaction_version: string;
  fn: string;
  token_address: string;
  treasury_amount: string;
  other_amount: string;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const timeFilter = (alias: string) => `${alias}.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND ${alias}.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

  // One row per (vault::execute_* tx, token) that paid the treasury, with the treasury
  // deposits and every other deposit of that token in the tx summed separately.
  // Gas rows carry no deposit_metadata, so they drop out.
  const rows: ClaimRow[] = await queryAllium(`
    WITH claims AS (
      SELECT DISTINCT t.transaction_version
      FROM aptos.assets.fungible_transfers t
      WHERE ${timeFilter("t")}
        AND t.to_address = '${TREASURY}'
        AND t.tx_payload:function::STRING LIKE '${ENTRY_PREFIX}%'
    )
    SELECT
      t.transaction_version,
      t.tx_payload:function::STRING AS fn,
      LOWER(t.token_address) AS token_address,
      CAST(SUM(IFF(t.to_address = '${TREASURY}', TRY_CAST(t.raw_amount_str AS DECIMAL(38, 0)), 0)) AS VARCHAR) AS treasury_amount,
      CAST(SUM(IFF(t.to_address = '${TREASURY}', 0, TRY_CAST(t.raw_amount_str AS DECIMAL(38, 0)))) AS VARCHAR) AS other_amount
    FROM aptos.assets.fungible_transfers t
    JOIN claims c ON c.transaction_version = t.transaction_version
    WHERE ${timeFilter("t")}
      AND t.deposit_metadata IS NOT NULL
    GROUP BY 1, 2, 3
    HAVING SUM(IFF(t.to_address = '${TREASURY}', TRY_CAST(t.raw_amount_str AS DECIMAL(38, 0)), 0)) > 0
  `);

  for (const row of rows) {
    const source = FEE_SOURCE[row.fn];
    if (!source)
      throw new Error(`yield-ai: treasury deposit from unclassified entry ${row.fn} in tx ${row.transaction_version}`);
    const cut = BigInt(row.treasury_amount);
    const userShare = BigInt(row.other_amount);
    let gross: bigint;
    if (source.kind === "kept") {
      gross = cut;
    } else if (userShare === 0n) {
      throw new Error(`yield-ai: tx ${row.transaction_version} (${row.fn}) deposited to the treasury with no paired safe deposit`);
    } else if (source.kind === "split") {
      gross = userShare + cut;
    } else {
      gross = userShare;
    }
    const supply = gross - cut;
    if (supply < 0n)
      throw new Error(`yield-ai: supply side went negative for tx ${row.transaction_version} (${row.fn})`);

    dailyFees.add(row.token_address, gross.toString(), source.label);
    dailyRevenue.add(row.token_address, cut.toString(), treasuryTo(source.label));
    if (supply > 0n) dailySupplySideRevenue.add(row.token_address, supply.toString(), safesKeep(source.label));
  }

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
  ProtocolRevenue: "The 5% performance fee on claimed rewards and LP fees, plus full-withdrawal dust, deposited to the protocol treasury. Yield AI has no governance token, so the whole fee stays with the protocol treasury.",
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
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  // First non-gas treasury deposit from vault::execute_* (execute_claim_apt, tx 4342516904).
  start: "2026-02-17",
  methodology,
  breakdownMethodology,
  doublecounted: true,
};

export default adapter;
