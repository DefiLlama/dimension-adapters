// dimension-adapters/fees/keep.ts  —  DeFiLlama Fees/Revenue adapter for Keep
// Keep: a refundable token launchpad on Solana.  https://keep.coffee
// Programs (mainnet): Full Launch ETVtC29T7ExxYyWSkpzKPxzrL3SRyrGPRhZe3FwXmFAo
//                    Idea Mode 2ww3589FBTgwbCd9sbpBjosiDszsigoqArh5xuc7F2Ve
//
// Where Keep's fees come from (verified from the program source):
//   1. Success platform fee — PLATFORM_FEE_BPS = 500 (5%) of each successful
//      raise, swept to the platform fee receiver in settle_success.rs.
//   2. Trading-fee harvest — harvest_fees.rs skims the accrued-fee (√k) fraction
//      of the burned Raydium LP; the platform's share (platform_amount) is
//      transferred to the platform fee receiver's USDC ATA, the project's share
//      (project_amount = fee_split_project_bps) to the project owner's USDC ATA.
//      Emitted as FeesHarvested { harvested_usdc, project_amount, platform_amount }.
//
// Both PLATFORM slices (success 5% + harvest platform_amount) land in the platform
// fee-receiver USDC ATA, so daily USDC received there = Keep's protocol revenue.

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from "../helpers/coreAssets.json";

// USDC mint (mainnet) — every Keep fee is USDC.
const USDC = ADDRESSES.solana.USDC;
// Platform fee-receiver USDC ATA (owner Fe7w5EnNJDphnSseonEPt2BSZhi9gosFvecZ6mSrqzMB).
const PLATFORM_FEE_USDC_ATA = "93CuxAXjjAExKJY2uNHidR9UrVSBJmgjng8NMQHnVzfB";

const KEEP_PROGRAMS = [
  "ETVtC29T7ExxYyWSkpzKPxzrL3SRyrGPRhZe3FwXmFAo", // Full Launch
  "2ww3589FBTgwbCd9sbpBjosiDszsigoqArh5xuc7F2Ve", // Idea Mode
];

// Anchor's first eight event bytes, base64-encoded. The complete event payload
// is decoded below; the prefix is only used to select FeesHarvested log lines.
const FEES_HARVESTED_PREFIX = "Huy2vk3+TAo";

/**
 * One Dune call: USDC inflows to the platform ATA (protocol revenue) plus the
 * project-owner share decoded from FeesHarvested events (supply-side).
 *
 * Event layout is Anchor discriminator (8 bytes), launchpad (32), project
 * owner (32), harvested_usdc (u64), project_amount (u64), platform_amount
 * (u64), tokens_burned (u64). Borsh integers are little-endian, hence the
 * byte reversal before Dune's numeric conversion.
 *
 * Filter the ATA with to_token_account, not to_owner — to_owner is the
 * platform fee-receiver wallet, not this token account.
 */
const getKeepFees = async (options: FetchOptions) => {
  const programs = KEEP_PROGRAMS.map((program) => `'${program}'`).join(", ");
  const rows = await queryDuneSql(options, `
    WITH platform AS (
      SELECT COALESCE(SUM(amount), 0) AS amount
      FROM tokens_solana.transfers
      WHERE to_token_account = '${PLATFORM_FEE_USDC_ATA}'
        AND token_mint_address = '${USDC}'
        AND TIME_RANGE
    ),
    fee_events AS (
      SELECT DISTINCT
        i.tx_id,
        substr(log_message, 15) AS payload
      FROM solana.instruction_calls i
      CROSS JOIN UNNEST(i.log_messages) AS logs(log_message)
      WHERE i.tx_success = TRUE
        AND i.outer_executing_account IN (${programs})
        AND TIME_RANGE
        AND starts_with(log_message, 'Program data: ${FEES_HARVESTED_PREFIX}')
    ),
    project AS (
      SELECT COALESCE(SUM(
        varbinary_to_uint256(reverse(varbinary_substring(from_base64(payload), 81, 8)))
      ), 0) AS amount
      FROM fee_events
    )
    SELECT
      (SELECT amount FROM platform) AS platform_amount,
      (SELECT amount FROM project) AS project_amount
  `);

  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const platformAmount = Number(rows?.[0]?.platform_amount);
  const projectAmount = Number(rows?.[0]?.project_amount);
  if (platformAmount > 0) dailyRevenue.add(USDC, platformAmount);
  if (projectAmount > 0) dailySupplySideRevenue.add(USDC, projectAmount);
  return { dailyRevenue, dailySupplySideRevenue };
};

const fetch = async (options: FetchOptions) => {
  const { dailyRevenue, dailySupplySideRevenue } = await getKeepFees(options);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailyRevenue, METRIC.PROTOCOL_FEES);
  dailyFees.addBalances(dailySupplySideRevenue, METRIC.CREATOR_FEES);

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addBalances(dailyRevenue, METRIC.PROTOCOL_FEES);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-08-20",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // raydium
  methodology: {
    Fees: "All Keep USDC fees: the platform fee-receiver inflows plus the project-owner share of harvested Raydium trading fees. The refundable raise principal and LP liquidity are excluded.",
    Revenue: "The platform portion of Keep fees, received by the platform fee-receiver USDC account. The project-owner share is reported as Supply Side Revenue.",
    SupplySideRevenue: "The project-owner share of harvested Raydium trading fees, decoded from Keep's on-chain FeesHarvested events.",
    ProtocolRevenue: "USDC fees received by Keep's platform fee-receiver account.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]: "Platform fee slices received by Keep's platform USDC ATA.",
      [METRIC.CREATOR_FEES]: "Project-owner share emitted in FeesHarvested events.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Platform fee slices retained by Keep's platform treasury.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "Project-owner share paid from harvested trading fees.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Platform fee slices received by Keep's platform treasury.",
    },
  },
};

export default adapter;
