// dimension-adapters/fees/keep.ts  —  DeFiLlama Fees/Revenue adapter for Keep
// Keep: a refundable token launchpad on Solana.  https://keep.coffee
// Programs (mainnet): Full Launch ETVtC29T7ExxYyWSkpzKPxzrL3SRyrGPRhZe3FwXmFAo
//                    Idea Mode 2ww3589FBTgwbCd9sbpBjosiDszsigoqArh5xuc7F2Ve
//
// All output is derived from on-chain USDC receipts. Platform receipts are
// filtered by the Keep programs and destination USDC token account; project
// receipts include staged raise-fee transfers and FeesHarvested events.
//
// All platform slices (staged raise fees + harvest platform_amount) land in the
// platform fee-receiver USDC ATA, so daily USDC received there = protocol revenue.

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
const PROJECT_CREATED_PREFIX = "wAqjHbkfQ6g";
const BOOTSTRAPPED_PREFIX = "ONeHjsYunZs";
const FINALIZED_D7_PREFIX = "JXozXYf7Ulg";
const FINALIZED_D30_PREFIX = "2Vt0QavIXBI";
const SUCCESS_EXECUTED_PREFIX = "Trx57IcWNIY";
const IDEA_FUNDING_RELEASED_PREFIX = "PKK4EmjFDVo";

const PROGRAM_DEPLOYMENT = "2026-06-14";

/**
 * One Dune call: USDC inflows to the platform ATA (protocol revenue) plus
 * project-owner staged raise fees and the share decoded from FeesHarvested
 * events (supply-side).
 *
 * Idea Mode pays the creator 3% at Bootstrap, another 7% at successful
 * settlement, and releases the final 35% through the creator funding stream.
 * These are ordinary SPL transfers, not FeesHarvested events, so the project
 * owner is resolved from ProjectCreated and stream releases are counted from
 * the IdeaFundingReleased event emitted after each actual transfer.
 *
 * Filter the ATA with to_token_account, not to_owner — to_owner is the
 * platform fee-receiver wallet, not this token account.
 *
 * ProjectCreated has to be read from before the current day, so it is bounded
 * by the program deployment date to keep it from scanning Solana history.
 */
const getKeepFees = async (options: FetchOptions) => {
  const programs = KEEP_PROGRAMS.map((program) => `'${program}'`).join(", ");
  const rows = await queryDuneSql(options, `
    WITH events AS (
      SELECT DISTINCT i.tx_id, substr(log_message, 15) AS payload
      FROM solana.instruction_calls i
      CROSS JOIN UNNEST(i.log_messages) AS logs(log_message)
      WHERE i.tx_success = TRUE
        AND i.outer_executing_account IN (${programs})
        AND TIME_RANGE
        AND starts_with(log_message, 'Program data: ')
    ),
    usdc_transfers AS (
      SELECT tx_id, amount, to_token_account, to_owner
      FROM tokens_solana.transfers
      WHERE token_mint_address = '${USDC}'
        AND outer_executing_account IN (${programs})
        AND TIME_RANGE
    ),
    staged_fee_txs AS (
      SELECT DISTINCT
        tx_id,
        to_base58(varbinary_substring(from_base64(payload), 9, 32)) AS launchpad
      FROM events
      WHERE starts_with(payload, '${BOOTSTRAPPED_PREFIX}')
        OR starts_with(payload, '${FINALIZED_D7_PREFIX}')
        OR starts_with(payload, '${FINALIZED_D30_PREFIX}')
        OR starts_with(payload, '${SUCCESS_EXECUTED_PREFIX}')
    ),
    project_owners AS (
      SELECT DISTINCT
        to_base58(varbinary_substring(from_base64(substr(log_message, 15)), 17, 32)) AS launchpad,
        to_base58(varbinary_substring(from_base64(substr(log_message, 15)), 81, 32)) AS project_owner
      FROM solana.instruction_calls i
      CROSS JOIN UNNEST(i.log_messages) AS logs(log_message)
      WHERE i.tx_success = TRUE
        AND i.outer_executing_account IN (${programs})
        AND i.block_time >= TIMESTAMP '${PROGRAM_DEPLOYMENT}'
        AND starts_with(log_message, 'Program data: ${PROJECT_CREATED_PREFIX}')
    )
    SELECT
      (
        SELECT COALESCE(SUM(amount), 0)
        FROM usdc_transfers
        WHERE to_token_account = '${PLATFORM_FEE_USDC_ATA}'
      ) AS platform_amount,
      (
        SELECT COALESCE(SUM(t.amount), 0)
        FROM usdc_transfers t
        JOIN staged_fee_txs s ON s.tx_id = t.tx_id
        JOIN project_owners p
          ON p.launchpad = s.launchpad
         AND p.project_owner = t.to_owner
      )
      + (
        SELECT COALESCE(SUM(
          varbinary_to_uint256(reverse(varbinary_substring(from_base64(payload), 73, 8)))
        ), 0)
        FROM events
        WHERE starts_with(payload, '${IDEA_FUNDING_RELEASED_PREFIX}')
      )
      + (
        SELECT COALESCE(SUM(
          varbinary_to_uint256(reverse(varbinary_substring(from_base64(payload), 81, 8)))
        ), 0)
        FROM events
        WHERE starts_with(payload, '${FEES_HARVESTED_PREFIX}')
      ) AS project_amount
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
    Fees: "All Keep USDC fees: platform fee-receiver inflows plus project-owner staged raise-fee transfers and harvested Raydium trading-fee shares. Refundable raise principal and LP liquidity are excluded.",
    Revenue: "The platform portion of Keep fees, received by the platform fee-receiver USDC account. The project-owner share is reported as Supply Side Revenue.",
    SupplySideRevenue: "Project-owner staged raise-fee transfers plus the project share of harvested Raydium trading fees, counted only after the on-chain transfer/event occurs.",
    ProtocolRevenue: "USDC fees received by Keep's platform fee-receiver account.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]: "Platform fee slices received by Keep's platform USDC ATA.",
      [METRIC.CREATOR_FEES]: "Project-owner staged raise-fee transfers and share emitted in FeesHarvested events.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Platform fee slices retained by Keep's platform treasury.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "Project-owner staged raise-fee transfers and share paid from harvested trading fees.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Platform fee slices received by Keep's platform treasury.",
    },
  },
};

export default adapter;
