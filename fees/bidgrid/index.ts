import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const PROGRAM_ID = "BDGRD2fcnDzz5ueWq39W7tSRDadFJonZUPG6CxQgJGHd";
const SOL_MINT = "So11111111111111111111111111111111111111112";
// Anchor discriminator for the zero-argument `reset` instruction.
const RESET_DISCRIMINATOR = "0x1751fb548ab7f0d6";

const LABELS = {
  MINING_FEES: "Mining Fees",
  MINING_FEES_TO_BUYBACK: "Mining Fees to $BDGR Buyback",
  MINING_FEES_TO_BURN_POT: "Mining Fees to Burn Pot",
  MINING_FEES_TO_JACKPOT: "Mining Fees to Jackpot",
  MINING_FEES_TO_STAKERS: "Mining Fees to $BDGR Stakers",
} as const;

const fetch = async (options: FetchOptions) => {
  const query = `
    WITH reset_txs AS (
      SELECT DISTINCT tx_id
      FROM solana.instruction_calls
      WHERE executing_account = '${PROGRAM_ID}'
        AND is_inner = false
        AND tx_success = true
        AND block_date BETWEEN date(from_unixtime(${options.fromTimestamp}))
          AND date(from_unixtime(${options.toTimestamp}))
        AND block_time >= from_unixtime(${options.fromTimestamp})
        AND block_time < from_unixtime(${options.toTimestamp})
        AND varbinary_starts_with(data, ${RESET_DISCRIMINATOR})
    ),
    reset_events AS (
      SELECT log_message
      FROM solana.instruction_calls ic
      CROSS JOIN UNNEST(log_messages) AS u(log_message)
      JOIN reset_txs r ON r.tx_id = ic.tx_id
      WHERE starts_with(log_message, 'Program data: ')
        AND ic.executing_account = '${PROGRAM_ID}'
        AND ic.is_inner = false
        AND ic.tx_success = true
        AND varbinary_starts_with(
          from_base64(substr(log_message, 15)),
          0x7c16d3bd8f2f9cde
        )
    ),
    reset_event_values AS (
      SELECT
        CAST(varbinary_to_bigint(varbinary_reverse(varbinary_substring(
          from_base64(substr(log_message, 15)), 139, 8
        ))) AS DOUBLE) AS total_deployed,
        CAST(varbinary_to_bigint(varbinary_reverse(varbinary_substring(
          from_base64(substr(log_message, 15)), 147, 8
        ))) AS DOUBLE) AS total_vaulted
      FROM reset_events
    ),
    round_allocations AS (
      SELECT
        COALESCE(SUM(CAST(FLOOR(total_deployed * 0.015) AS BIGINT)), 0)
          AS admin_lamports,
        COALESCE(SUM(CAST(FLOOR(
          GREATEST(total_vaulted - FLOOR(total_deployed * 0.015), 0.0) * 0.4
        ) AS BIGINT)), 0) AS buyback_lamports,
        COALESCE(SUM(CAST(FLOOR(
          GREATEST(total_vaulted - FLOOR(total_deployed * 0.015), 0.0) * 0.05
        ) AS BIGINT)), 0) AS burn_pot_lamports,
        COALESCE(SUM(CAST(FLOOR(
          GREATEST(total_vaulted - FLOOR(total_deployed * 0.015), 0.0) * 0.4
        ) AS BIGINT)), 0) AS jackpot_lamports,
        COALESCE(SUM(CAST(FLOOR(
          GREATEST(total_vaulted - FLOOR(total_deployed * 0.015), 0.0) * 0.2
        ) AS BIGINT)), 0) AS staking_lamports
      FROM reset_event_values
    )
    SELECT
      round_allocations.admin_lamports
        + round_allocations.buyback_lamports
        + round_allocations.burn_pot_lamports
        + round_allocations.jackpot_lamports
        + round_allocations.staking_lamports AS round_fee_lamports,
      round_allocations.buyback_lamports,
      round_allocations.burn_pot_lamports,
      round_allocations.jackpot_lamports,
      round_allocations.staking_lamports
    FROM round_allocations
  `;

  const [row = {}] = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.add(SOL_MINT, row.round_fee_lamports ?? 0, LABELS.MINING_FEES);
  dailyRevenue.add(SOL_MINT, row.round_fee_lamports ?? 0, LABELS.MINING_FEES);

  dailyHoldersRevenue.add(
    SOL_MINT,
    row.buyback_lamports ?? 0,
    LABELS.MINING_FEES_TO_BUYBACK,
  );
  dailyHoldersRevenue.add(
    SOL_MINT,
    row.staking_lamports ?? 0,
    LABELS.MINING_FEES_TO_STAKERS,
  );
  dailyHoldersRevenue.add(
    SOL_MINT,
    row.burn_pot_lamports ?? 0,
    LABELS.MINING_FEES_TO_BURN_POT,
  );
  dailyHoldersRevenue.add(
    SOL_MINT,
    row.jackpot_lamports ?? 0,
    LABELS.MINING_FEES_TO_JACKPOT,
  );

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees:
    "Successful mainnet round-settlement fees calculated from the BidGrid ResetEvent allocation fields. User deposits, payouts and premine transfers are not counted as fees.",
  UserFees:
    "The same round-settlement fee flow, representing the protocol charge created by user activity.",
  Revenue:
    "All measured BidGrid round-fee allocations, following the lightweight GODL-style presentation.",
  HoldersRevenue:
    "Round-fee allocations assigned to the BDGR buyback, staking, jackpot and burn-pot pools.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.MINING_FEES]:
      "Total native-SOL round fees calculated from successful BidGrid ResetEvent allocations.",
  },
  Revenue: {
    [LABELS.MINING_FEES]:
      "All measured native-SOL round fees collected by BidGrid.",
  },
  HoldersRevenue: {
    [LABELS.MINING_FEES_TO_BUYBACK]:
      "4% of the non-winning-tile fee allocated to BDGR buybacks.",
    [LABELS.MINING_FEES_TO_STAKERS]:
      "2% of the non-winning-tile fee allocated to eligible BDGR stakers.",
    [LABELS.MINING_FEES_TO_BURN_POT]:
      "0.5% of the non-winning-tile fee assigned to the Burn Pot for instant refined BDGR burns for SOL.",
    [LABELS.MINING_FEES_TO_JACKPOT]:
      "4% of the non-winning-tile fee assigned to the accumulating SOL jackpot pool.",
  },
};

const adapter: SimpleAdapter = {
  // Dune-backed adapters run once per day in DefiLlama.
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: { fetch, start: "2026-08-16" },
  },
  protocolType: ProtocolType.PROTOCOL,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
