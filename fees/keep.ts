// dimension-adapters/fees/keep.ts  —  DeFiLlama Fees/Revenue adapter for Keep
// Keep: a refundable token launchpad on Solana.  https://keep.coffee
// Programs (mainnet): Full Launch ETVtC29T7ExxYyWSkpzKPxzrL3SRyrGPRhZe3FwXmFAo
//                    Idea Mode 2ww3589FBTgwbCd9sbpBjosiDszsigoqArh5xuc7F2Ve
//
// Draft for dimension-adapters/fees/keep.ts.
// Keep has had no successful launch at the time this adapter was staged, so
// historical output is currently zero. The non-zero path is still entirely
// on-chain: platform receipts are read from the platform USDC ATA and the
// project-owner share is decoded from Keep's FeesHarvested event.
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
import { getSolanaReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

// USDC mint (mainnet) — every Keep fee is USDC.
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
// Platform fee-receiver USDC ATA = ATA(USDC, factory_config.platform_fee_receiver Fe7w5…).
// Verified in the mainnet fingerprint (owner == platform_fee_receiver, mint == USDC).
const PLATFORM_FEE_USDC_ATA = "93CuxAXjjAExKJY2uNHidR9UrVSBJmgjng8NMQHnVzfB";

const KEEP_PROGRAMS = [
  "ETVtC29T7ExxYyWSkpzKPxzrL3SRyrGPRhZe3FwXmFAo", // Full Launch
  "2ww3589FBTgwbCd9sbpBjosiDszsigoqArh5xuc7F2Ve", // Idea Mode
];

// Anchor's first eight event bytes, base64-encoded. The complete event payload
// is decoded below; the prefix is only used to select FeesHarvested log lines.
const FEES_HARVESTED_PREFIX = "Huy2vk3+TAo";

/**
 * Read the project-owner share from Keep's on-chain FeesHarvested events.
 *
 * Event layout is Anchor discriminator (8 bytes), launchpad (32), project
 * owner (32), harvested_usdc (u64), project_amount (u64), platform_amount
 * (u64), tokens_burned (u64). Borsh integers are little-endian, hence the
 * byte reversal before Dune's numeric conversion.
 */
const getProjectFees = async (options: FetchOptions) => {
  const projectFees = options.createBalances();
  const programs = KEEP_PROGRAMS.map((program) => `'${program}'`).join(", ");
  const rows = await queryDuneSql(options, `
    WITH fee_events AS (
      SELECT DISTINCT
        i.tx_id,
        i.block_time,
        substr(log_message, 15) AS payload
      FROM solana.instruction_calls i
      CROSS JOIN UNNEST(i.log_messages) AS logs(log_message)
      WHERE i.tx_success = TRUE
        AND i.outer_executing_account IN (${programs})
        AND TIME_RANGE
        AND starts_with(log_message, 'Program data: ${FEES_HARVESTED_PREFIX}')
    )
    SELECT
      COALESCE(SUM(
        varbinary_to_uint256(reverse(varbinary_substring(from_base64(payload), 81, 8)))
      ), 0) AS project_amount
    FROM fee_events
  `, { extraUIDKey: "keep-fees-harvested" });

  const amount = rows?.[0]?.project_amount;
  if (amount != null && Number(amount) > 0) {
    projectFees.add(USDC, Number(amount), METRIC.CREATOR_FEES);
  }
  return projectFees;
};

const fetch = async (options: FetchOptions) => {
  const dailyRevenue = options.createBalances();
  // USDC received by the platform fee ATA on this day = protocol's fee take
  // (success/failure raise fee slices + harvested platform_amount).
  await getSolanaReceived({
    options,
    balances: dailyRevenue,
    target: PLATFORM_FEE_USDC_ATA,
    mints: [USDC],
  });

  const dailySupplySideRevenue = await getProjectFees(options);
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
  start: "2026-01-01",
  dependencies: [Dependencies.DUNE],
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
