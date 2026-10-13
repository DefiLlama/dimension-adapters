// dimension-adapters/fees/keep.ts  —  DeFiLlama Fees/Revenue adapter for Keep
// Keep: a refundable token launchpad on Solana and Robinhood Chain.  https://keep.coffee
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

// RH Full only. The current metadata-v1 factory is the sole creation route;
// historical factories are intentionally not mixed into this new listing.
const RH_FULL_FACTORIES = [
  "0xC3f2831429F51aCe9243aCe75819488e3566CA7b", // mainnet metadata-v1, block 86016310
];
const RH_FULL_START_BLOCK = 86016310;
const RH_USDG = ADDRESSES.robinhood.USDG;

const RH_PROJECT_CREATED =
  "event ProjectCreated(uint64 indexed projectId, address indexed launchpad, address indexed token, address creator, uint8 mode)";
const RH_FUNDING_RELEASED =
  "event FundingReleased(uint8 indexed stage, uint256 platformAmount, uint256 projectAmount)";
const RH_SETTLED_SUCCESS =
  "event SettledSuccess(uint256 platformAmount, uint256 projectAmount, uint128 liquidityLocked)";
const RH_SETTLED_FAILURE =
  "event SettledFailure(uint256 platformAmount, uint256 projectAmount)";
const RH_HARVESTED =
  "event Harvested(uint256 usdcToPlatform, uint256 usdcToProject, uint256 tokensBurned)";

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

/**
 * RH Full emits these fee amounts only after the USDG transfers succeed.
 * Reading the events therefore measures creator/platform receipts, rather
 * than scheduled or refundable principal. ResidualSwept is deliberately not
 * included: it is a refund-pool sweep, not a fee.
 */
const getRobinhoodFullFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // The current Factory was deployed after the adapter's Solana start date;
  // avoid asking the indexer for an invalid pre-deployment block range during
  // historical refills.
  const toBlock = await options.getToBlock();
  if (toBlock < RH_FULL_START_BLOCK) return { dailyFees, dailyRevenue, dailySupplySideRevenue };
  const created = await options.getLogs({
    targets: RH_FULL_FACTORIES,
    eventAbi: RH_PROJECT_CREATED,
    fromBlock: RH_FULL_START_BLOCK,
    toBlock,
    cacheInCloud: true,
  });
  const launchpads = [...new Set(created.map((log: any) => String(log.launchpad).toLowerCase()))];
  if (launchpads.length === 0) return { dailyFees, dailyRevenue, dailySupplySideRevenue };

  const [funding, success, failure, harvested] = await Promise.all([
    options.getLogs({ targets: launchpads, eventAbi: RH_FUNDING_RELEASED }),
    options.getLogs({ targets: launchpads, eventAbi: RH_SETTLED_SUCCESS }),
    options.getLogs({ targets: launchpads, eventAbi: RH_SETTLED_FAILURE }),
    options.getLogs({ targets: launchpads, eventAbi: RH_HARVESTED }),
  ]);

  const platform = (amount: bigint | string | number, label: string) => {
    if (BigInt(amount) > 0n) {
      dailyFees.add(RH_USDG, amount, label);
      dailyRevenue.add(RH_USDG, amount, label);
    }
  };
  const creator = (amount: bigint | string | number, label: string) => {
    if (BigInt(amount) > 0n) {
      dailyFees.add(RH_USDG, amount, label);
      dailySupplySideRevenue.add(RH_USDG, amount, label);
    }
  };

  for (const log of funding) {
    platform(log.platformAmount, "RH Full fundraising fees to platform");
    creator(log.projectAmount, "RH Full fundraising fees to creators");
  }
  for (const log of success) {
    platform(log.platformAmount, "RH Full fundraising fees to platform");
    creator(log.projectAmount, "RH Full fundraising fees to creators");
  }
  for (const log of failure) {
    platform(log.platformAmount, "RH Full fundraising fees to platform");
    creator(log.projectAmount, "RH Full fundraising fees to creators");
  }
  for (const log of harvested) {
    platform(log.usdcToPlatform, "RH Full trading fees to platform");
    creator(log.usdcToProject, "RH Full trading fees to creators");
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  let dailyRevenue;
  let dailySupplySideRevenue;
  if (options.chain === CHAIN.ROBINHOOD) {
    const result = await getRobinhoodFullFees(options);
    dailyFees.addBalances(result.dailyFees);
    dailyRevenue = result.dailyRevenue;
    dailySupplySideRevenue = result.dailySupplySideRevenue;
  } else {
    const result = await getKeepFees(options);
    dailyRevenue = result.dailyRevenue;
    dailySupplySideRevenue = result.dailySupplySideRevenue;
    dailyFees.addBalances(dailyRevenue, METRIC.PROTOCOL_FEES);
    dailyFees.addBalances(dailySupplySideRevenue, METRIC.CREATOR_FEES);
  }

  const dailyProtocolRevenue = options.createBalances();
  if (options.chain === CHAIN.ROBINHOOD) dailyProtocolRevenue.addBalances(dailyRevenue);
  else dailyProtocolRevenue.addBalances(dailyRevenue, METRIC.PROTOCOL_FEES);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.SOLANA]: {
      start: "2026-07-15",
    },
    [CHAIN.ROBINHOOD]: {
      start: "2026-10-10",
    }
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // Raydium and Uniswap V4 pool fees may be tracked by the underlying DEX listings.
  methodology: {
    Fees: "All Keep fees paid to the platform and creators: Solana USDC receipts plus Robinhood Full USDG fundraising and trading-fee receipts. Refundable raise principal, residual refund-pool sweeps and LP liquidity are excluded.",
    Revenue: "Keep's platform share of Solana USDC fees and Robinhood Full USDG fundraising and trading fees, counted only after the on-chain receipt occurs; creator shares are reported as Supply Side Revenue.",
    SupplySideRevenue: "Creator shares actually paid from Solana staged funding and harvested trading fees, plus Robinhood Full FundingReleased, settlement and Harvested creator receipts.",
    ProtocolRevenue: "Keep's platform share of Solana USDC fees and Robinhood Full USDG fundraising and trading fees sent to the platform treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]: "Platform fee slices received by Keep's platform USDC ATA.",
      [METRIC.CREATOR_FEES]: "Project-owner staged raise-fee transfers and share emitted in FeesHarvested events.",
      "RH Full fundraising fees to platform": "Robinhood Full staged and terminal fundraising fee amounts paid to the platform.",
      "RH Full fundraising fees to creators": "Robinhood Full staged and terminal fundraising fee amounts paid to creators.",
      "RH Full trading fees to platform": "Robinhood Full USDG trading-fee share paid to the platform when Harvested is emitted.",
      "RH Full trading fees to creators": "Robinhood Full USDG trading-fee share paid to creators when Harvested is emitted.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Platform fee slices retained by Keep's platform treasury.",
      "RH Full fundraising fees to platform": "Robinhood Full staged and terminal fundraising fee amounts paid to the platform.",
      "RH Full trading fees to platform": "Robinhood Full USDG trading-fee share paid to the platform when Harvested is emitted.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "Project-owner staged raise-fee transfers and share paid from harvested trading fees.",
      "RH Full fundraising fees to creators": "Robinhood Full staged and terminal fundraising fee amounts paid to creators.",
      "RH Full trading fees to creators": "Robinhood Full USDG trading-fee share paid to creators when Harvested is emitted.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Platform fee slices received by Keep's platform treasury.",
      "RH Full fundraising fees to platform": "Robinhood Full staged and terminal fundraising fee amounts paid to the platform.",
      "RH Full trading fees to platform": "Robinhood Full USDG trading-fee share paid to the platform when Harvested is emitted.",
    },
  },
};

export default adapter;
