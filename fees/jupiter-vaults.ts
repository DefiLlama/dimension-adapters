import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";

// IDL: https://github.com/jup-ag/earn-vaults-curators-sdk/blob/main/idl.json
const PROGRAM_ID = 'JUPVau1tSdENvv7KCwFY6Geer1a442q9mAfmaRXm83g'

const EXIT_FEES_RETAINED_FROM_SLOT = 467815534

const LABELS = {
  INSTANT_EXIT: 'Instant Exit Fees',
  QUEUED_EXIT: 'Queued Exit Fees',
  PERFORMANCE: 'Performance Fees',
  MANAGEMENT: 'Management Fees',
  CURATOR_INSTANT_EXIT: 'Instant Exit Fees To Curators',
  CURATOR_QUEUED_EXIT: 'Queued Exit Fees To Curators',
  DEPOSITOR_INSTANT_EXIT: 'Instant Exit Fees To Depositors',
  DEPOSITOR_QUEUED_EXIT: 'Queued Exit Fees To Depositors',
  CURATOR_PERFORMANCE: 'Performance Fees To Curators',
  CURATOR_MANAGEMENT: 'Management Fees To Curators',
  PROTOCOL_PERFORMANCE: 'Performance Fees To Protocol',
  PROTOCOL_MANAGEMENT: 'Management Fees To Protocol',
}

const u64 = (offset: number) => `bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, ${offset}, 8)))`

async function fetch(options: FetchOptions) {
  assertDuneSolanaIndexed(options)

  const query = `
    WITH ev AS (
      SELECT tx_id, block_slot, outer_instruction_index * 1000 + coalesce(inner_instruction_index, 0) AS pos,
             bytearray_to_bigint(bytearray_substring(data, 2, 1)) AS tag, data
      FROM solana.instruction_calls
      WHERE TIME_RANGE
        AND executing_account = '${PROGRAM_ID}'
        AND tx_success
        AND bytearray_substring(data, 1, 1) = 0xfe
        AND bytearray_substring(data, 2, 1) IN (0x06, 0x09, 0x0a, 0x0c)
    ),
    aum AS (
      SELECT tx_id, pos, ${u64(43)} AS eff_aum, ${u64(51)} AS eff_supply FROM ev WHERE tag = 9
    ),
    exits AS (
      SELECT ev.tx_id, ev.pos, ev.tag, ev.block_slot >= ${EXIT_FEES_RETAINED_FROM_SLOT} AS retained,
             CASE WHEN ev.tag = 10 THEN ${u64(35)} END AS shares_burned,
             ${u64(43)} AS instant_paid, ${u64(51)} AS fee_shares
      FROM ev WHERE ev.tag IN (6, 10)
    ),
    exits_priced AS (
      SELECT e.tag, e.retained,
        CASE WHEN e.tag = 10
          THEN e.fee_shares * e.instant_paid / cast(nullif(e.shares_burned - e.fee_shares, 0) AS double)
          ELSE e.fee_shares * max_by(a.eff_aum, a.pos) / cast(nullif(max_by(a.eff_supply, a.pos), 0) AS double)
        END / 1e6 AS fee_usd
      FROM exits e
      LEFT JOIN aum a ON a.tx_id = e.tx_id AND a.pos < e.pos
      GROUP BY e.tx_id, e.pos, e.tag, e.retained, e.shares_burned, e.instant_paid, e.fee_shares
    )
    SELECT
      coalesce((SELECT sum(fee_usd) FROM exits_priced WHERE tag = 10 AND NOT retained), 0) AS instant_exit_curator,
      coalesce((SELECT sum(fee_usd) FROM exits_priced WHERE tag = 10 AND retained), 0) AS instant_exit_depositors,
      coalesce((SELECT sum(fee_usd) FROM exits_priced WHERE tag = 6 AND NOT retained), 0) AS queued_exit_curator,
      coalesce((SELECT sum(fee_usd) FROM exits_priced WHERE tag = 6 AND retained), 0) AS queued_exit_depositors,
      coalesce((SELECT sum(${u64(35)}) FROM ev WHERE tag = 12), 0) / 1e6 AS curator_management,
      coalesce((SELECT sum(${u64(43)}) FROM ev WHERE tag = 12), 0) / 1e6 AS protocol_management,
      coalesce((SELECT sum(${u64(51)}) FROM ev WHERE tag = 12), 0) / 1e6 AS curator_performance,
      coalesce((SELECT sum(${u64(59)}) FROM ev WHERE tag = 12), 0) / 1e6 AS protocol_performance
  `
  const [row] = await queryDuneSql(options, query)
  if (!row) throw new Error(`jupiter-vaults: Dune returned no row for ${options.dateString}`)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const instantExitCurator = Number(row.instant_exit_curator)
  const instantExitDepositors = Number(row.instant_exit_depositors)
  const queuedExitCurator = Number(row.queued_exit_curator)
  const queuedExitDepositors = Number(row.queued_exit_depositors)
  const curatorManagement = Number(row.curator_management)
  const protocolManagement = Number(row.protocol_management)
  const curatorPerformance = Number(row.curator_performance)
  const protocolPerformance = Number(row.protocol_performance)

  dailyFees.addUSDValue(instantExitCurator + instantExitDepositors, LABELS.INSTANT_EXIT)
  dailyFees.addUSDValue(queuedExitCurator + queuedExitDepositors, LABELS.QUEUED_EXIT)
  dailyFees.addUSDValue(curatorPerformance + protocolPerformance, LABELS.PERFORMANCE)
  dailyFees.addUSDValue(curatorManagement + protocolManagement, LABELS.MANAGEMENT)

  dailySupplySideRevenue.addUSDValue(instantExitCurator, LABELS.CURATOR_INSTANT_EXIT)
  dailySupplySideRevenue.addUSDValue(instantExitDepositors, LABELS.DEPOSITOR_INSTANT_EXIT)
  dailySupplySideRevenue.addUSDValue(queuedExitCurator, LABELS.CURATOR_QUEUED_EXIT)
  dailySupplySideRevenue.addUSDValue(queuedExitDepositors, LABELS.DEPOSITOR_QUEUED_EXIT)
  dailySupplySideRevenue.addUSDValue(curatorPerformance, LABELS.CURATOR_PERFORMANCE)
  dailySupplySideRevenue.addUSDValue(curatorManagement, LABELS.CURATOR_MANAGEMENT)

  dailyRevenue.addUSDValue(protocolPerformance, LABELS.PROTOCOL_PERFORMANCE)
  dailyRevenue.addUSDValue(protocolManagement, LABELS.PROTOCOL_MANAGEMENT)

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

const methodology = {
  Fees: "Fees paid by vault depositors: instant and queued exit fees, performance fees and management fees, read from the program's events. Interest earned by vault deposits is counted in the Jupiter Lend and Jupiter Offerbook adapters, so it is not repeated here.",
  Revenue: "The protocol's share of performance and management fees. The program's protocol fee rate is currently 0.",
  ProtocolRevenue: "The protocol's share of performance and management fees. The program's protocol fee rate is currently 0.",
  SupplySideRevenue: "Performance and management fees paid to vault curators in newly minted vault shares, plus exit fees, which went to curators until the 10 November 2026 program upgrade and have stayed in the vault for the remaining depositors since then.",
}

const breakdownMethodology = {
  Fees: {
    [LABELS.INSTANT_EXIT]: "Fee on instant redemptions, valued at the redemption's own share price.",
    [LABELS.QUEUED_EXIT]: "Fee on settled queued redemptions, valued at the vault's share price in the same transaction.",
    [LABELS.PERFORMANCE]: "Fee on gains above the vault's high-water mark, in USD as reported by the feeAccrued event.",
    [LABELS.MANAGEMENT]: "Annual fee on vault assets, accrued over time, in USD as reported by the feeAccrued event.",
  },
  Revenue: {
    [LABELS.PROTOCOL_PERFORMANCE]: "Protocol share of performance fees.",
    [LABELS.PROTOCOL_MANAGEMENT]: "Protocol share of management fees.",
  },
  ProtocolRevenue: {
    [LABELS.PROTOCOL_PERFORMANCE]: "Protocol share of performance fees.",
    [LABELS.PROTOCOL_MANAGEMENT]: "Protocol share of management fees.",
  },
  SupplySideRevenue: {
    [LABELS.CURATOR_INSTANT_EXIT]: "Instant exit fees paid to the vault's curator in newly minted vault shares, until the 10 November 2026 program upgrade.",
    [LABELS.CURATOR_QUEUED_EXIT]: "Queued exit fees paid to the vault's curator in newly minted vault shares, until the 10 November 2026 program upgrade.",
    [LABELS.DEPOSITOR_INSTANT_EXIT]: "Instant exit fees kept in the vault for its remaining depositors, since the 10 November 2026 program upgrade.",
    [LABELS.DEPOSITOR_QUEUED_EXIT]: "Queued exit fees kept in the vault for its remaining depositors, since the 10 November 2026 program upgrade.",
    [LABELS.CURATOR_PERFORMANCE]: "Performance fees paid to the vault's curator.",
    [LABELS.CURATOR_MANAGEMENT]: "Management fees paid to the vault's curator.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-09-14',
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
}

export default adapter
