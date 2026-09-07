import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const PROGRAM_ID = "BDGRD2fcnDzz5ueWq39W7tSRDadFJonZUPG6CxQgJGHd";
const SOL_MINT = "So11111111111111111111111111111111111111112";
// Mainnet program ID and SOL mint: https://bidgrid.win/about
const RESET_DISCRIMINATOR = "0x1751fb548ab7f0d6";
const RESET_EVENT_DISCRIMINATOR = "0x7c16d3bd8f2f9cde";

// Fee constants in basis points, verified against mainnet reset txs (the
// allocations below reconcile exactly with per-round balance changes, e.g. tx
// 5FtXMYuqdcESytABejiKfffg9czYGXGxZw2RrEKvppQJoScKdycjPGx4X6K8X3sxKCVbJb5G7UMovEc6zn7Bn4wy).
// Winning tiles pay 1.5% of deployed, losing tiles 12% (1.5% + 10.5%).
// The protocol fee is the 1.5% protocol allocation from total_deployed. The
// normal-mode ResetEvent.total_vaulted contains protocol fee + buyback + jackpot
// + staking. Burn Pot is transferred separately, so its ratio below is relative
// to the non-protocol treasury portion rather than to total_vaulted.
const PROTOCOL_FEE_BPS = 150;
const BUYBACK_BPS = 400;
const JACKPOT_BPS = 400;
const STAKING_BPS = 200;
const BURN_POT_BPS = 50;
const NON_PROTOCOL_TREASURY_BPS = BUYBACK_BPS + JACKPOT_BPS + STAKING_BPS;

const LABELS = {
  MINING_FEES: "Mining Fees",
  MINING_FEES_REVENUE: "Mining Fees Revenue",
  PROTOCOL_REVENUE: "Protocol Revenue",
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
        AND TIME_RANGE
        AND varbinary_starts_with(data, ${RESET_DISCRIMINATOR})
    ),
    reset_events AS (
      SELECT log_message
      FROM solana.instruction_calls ic
      CROSS JOIN UNNEST(log_messages) AS u(log_message)
      JOIN reset_txs r ON r.tx_id = ic.tx_id
      AND TIME_RANGE
      WHERE starts_with(log_message, 'Program data: ')
        AND ic.executing_account = '${PROGRAM_ID}'
        AND ic.is_inner = false
        AND ic.tx_success = true
        AND varbinary_starts_with(
          from_base64(substr(log_message, 15)),
          ${RESET_EVENT_DISCRIMINATOR}
        )
        AND TIME_RANGE
    ),
    reset_event_values AS (
      SELECT
        -- Dune varbinary_substring uses 1-based offsets into the full payload
        -- (8-byte event discriminator included): total_deployed at byte 139,
        -- total_vaulted at byte 147. Verified against mainnet reset txs:
        -- total_vaulted matches the vault PDA (9ACAiN...) inflow exactly.
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
        COALESCE(SUM(CAST(FLOOR(total_deployed * ${PROTOCOL_FEE_BPS}.0 / 10000.0) AS BIGINT)), 0)
          AS protocol_lamports,
        COALESCE(SUM(CAST(FLOOR(
          GREATEST(total_vaulted - FLOOR(total_deployed * ${PROTOCOL_FEE_BPS}.0 / 10000.0), 0.0)
            * ${BUYBACK_BPS}.0 / ${NON_PROTOCOL_TREASURY_BPS}.0
        ) AS BIGINT)), 0) AS buyback_lamports,
        COALESCE(SUM(CAST(FLOOR(
          GREATEST(total_vaulted - FLOOR(total_deployed * ${PROTOCOL_FEE_BPS}.0 / 10000.0), 0.0)
            * ${BURN_POT_BPS}.0 / ${NON_PROTOCOL_TREASURY_BPS}.0
        ) AS BIGINT)), 0) AS burn_pot_lamports,
        COALESCE(SUM(CAST(FLOOR(
          GREATEST(total_vaulted - FLOOR(total_deployed * ${PROTOCOL_FEE_BPS}.0 / 10000.0), 0.0)
            * ${JACKPOT_BPS}.0 / ${NON_PROTOCOL_TREASURY_BPS}.0
        ) AS BIGINT)), 0) AS jackpot_lamports,
        COALESCE(SUM(CAST(FLOOR(
          GREATEST(total_vaulted - FLOOR(total_deployed * ${PROTOCOL_FEE_BPS}.0 / 10000.0), 0.0)
            * ${STAKING_BPS}.0 / ${NON_PROTOCOL_TREASURY_BPS}.0
        ) AS BIGINT)), 0) AS staking_lamports
      FROM reset_event_values
    )
    SELECT
      round_allocations.protocol_lamports,
      round_allocations.protocol_lamports
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
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.add(SOL_MINT, row.round_fee_lamports ?? 0, LABELS.MINING_FEES);
  // Jackpot SOL is paid back to winning miners and is therefore supply-side
  // revenue, not gross profit. The protocol fee is protocol revenue.
  dailySupplySideRevenue.add(
    SOL_MINT,
    row.jackpot_lamports ?? 0,
    LABELS.MINING_FEES_TO_JACKPOT,
  );
  dailyProtocolRevenue.add(
    SOL_MINT,
    row.protocol_lamports ?? 0,
    LABELS.PROTOCOL_REVENUE,
  );

  dailyRevenue.add(
    SOL_MINT,
    Math.max(
      Number(row.round_fee_lamports ?? 0) - Number(row.jackpot_lamports ?? 0),
      0,
    ),
    LABELS.MINING_FEES_REVENUE,
  );

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
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Successful mainnet round-settlement fees calculated from the BidGrid ResetEvent allocation fields. User deposits, payouts and premine transfers are not counted as fees.",
  Revenue:
    "Gross profit from BidGrid round fees after excluding the jackpot amount paid back to winning miners.",
  ProtocolRevenue:
    "The 1.5% protocol fee from each round's total deployed SOL, retained as the protocol treasury allocation.",
  HoldersRevenue:
    "Round-fee allocations assigned to BDGR buybacks, BDGR staking rewards and the Burn Pot.",
  SupplySideRevenue:
    "The jackpot allocation paid back to winning miners from the non-winning-tile fee.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.MINING_FEES]:
      "Total native-SOL round fees calculated from successful BidGrid ResetEvent allocations.",
  },
  Revenue: {
    [LABELS.MINING_FEES_REVENUE]:
      "Native-SOL round fees retained as gross profit after the jackpot payout allocation.",
  },
  ProtocolRevenue: {
    [LABELS.PROTOCOL_REVENUE]:
      "The 1.5% protocol fee from each round's total deployed SOL, retained as the protocol treasury allocation.",
  },
  SupplySideRevenue: {
    [LABELS.MINING_FEES_TO_JACKPOT]:
      "4% of losing-tile deployment value allocated to the SOL jackpot paid to winning miners.",
  },
  HoldersRevenue: {
    [LABELS.MINING_FEES_TO_BUYBACK]:
      "4% of the non-winning-tile fee allocated to BDGR buybacks.",
    [LABELS.MINING_FEES_TO_STAKERS]:
      "2% of the non-winning-tile fee allocated to eligible BDGR stakers.",
    [LABELS.MINING_FEES_TO_BURN_POT]:
      "0.5% of the non-winning-tile fee assigned to the Burn Pot for instant refined BDGR burns for SOL.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-08-16",
  protocolType: ProtocolType.PROTOCOL,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
