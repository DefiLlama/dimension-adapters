import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { METRIC } from "../../helpers/metrics";

// Peep (https://peep.fun) is a Solana trading and social app. Fee terms:
// https://peep.fun/private/terms (section 6 "Trading and fees", section 10 "Groups, calls and tips").
//
// Peep treasury (fee wallet), published by Peep at https://peep.fun/private/methodology#fee-wallet.
// It receives two fees, both as top-level System Program SOL transfers that the user signs and pays for:
// 1. Trading fee: 0.75% of each swap between SOL and a token made in Peep, inside the swap transaction,
//    which runs a Jupiter v6 route as a top-level instruction. Swaps between SOL and USDC/USDT and
//    token-to-token swaps carry no Peep fee. Peep does not use Jupiter's platform/referral fee, so this
//    fee is not counted by any Jupiter listing.
//    Sample (81,723 lamports, 2026-09-30):
//    5ZPezUQpi6MxAKYApxitUuj4kQPUbFoJskiaAaPLWifEChEUoPFgtxN5fSqN16EdgqojpxfxhZYHsFhsKpMEu75S
// 2. Paid group join: one transaction with two System transfers from the member, Peep's 5% (rounded
//    down) to the treasury and the rest to the group's creator. Only Peep's 5% is counted (see methodology).
//    Sample (500,000 lamports to the treasury, 9,500,000 to the creator, 2026-10-01):
//    2zJuUuCxiuyHCatTnDFw2wVh88bg5xTHYQpY57sL81EK4MmiqJtPD67wB9wjc1Ap9JrbjdWezqE8kgfpKFSKz8XM
// A Peep swap carries exactly one fee transfer: a swap transaction with more than one SOL transfer to the
// treasury, or one not sent by its signer, matches no known shape and makes the adapter throw.
// The treasury also receives SOL that is not a fee: direct transfers (a transaction whose only movement is one
// SOL transfer to the treasury, from the operator or anyone else) and its own transactions (signed by the
// treasury). Neither is counted. Direct transfers are recognised rather than rejected, because anyone can
// send SOL to a public address and a stray transfer must not stop the adapter. Failed transactions
// are ignored. Every fee payer is a Peep user, so no payer is excluded. Any other SOL inflow, or a
// transaction Allium has not fully indexed, makes the adapter throw instead of storing a partial value.
const TREASURY = 'HZbtepdvv8QiNX5dau4sQrCDiNKrBy35eNzrBN8jg6T6';
const JUPITER_V6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
// Peep's share of a paid group join: 500 bps of the join price, rounded down ("Peep takes 5% of each
// payment", https://peep.fun/private/terms section 10). Used only to recognise the group payment on
// chain; the amount itself is read from the transfer. Unchanged since the first paid join; a change
// needs a date guard here.
const GROUP_FEE_BPS = 500;

const LABELS = {
  GROUP_JOIN_FEES: 'Paid Group Join Fees',
  TRADING_FEES_TO_TREASURY: 'Trading Fees To Treasury',
  GROUP_JOIN_FEES_TO_TREASURY: 'Paid Group Join Fees To Treasury',
};

const fetch = async (options: FetchOptions) => {
  const timeRange = (alias: string) => `${alias}.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND ${alias}.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;
  const fromSigner = (alias: string) => `${alias}.transfer_type = 'sol_transfer' AND ${alias}.program_id = '${SYSTEM_PROGRAM}' AND ${alias}.from_address = ${alias}.signer`;

  const rows = await queryAllium(`
    WITH inflows AS (
      -- every SOL credit to the treasury in the window (Peep fees are only paid in SOL)
      SELECT r.txn_id, r.signer, IFF(${fromSigner('r')}, 1, 0) AS from_signer, TRY_TO_DECIMAL(r.raw_amount_str, 38, 0) AS lamports,
        COUNT(*) OVER (PARTITION BY r.txn_id) AS tx_inflows
      FROM solana.assets.transfers r
      WHERE r.to_address = '${TREASURY}'
        AND r.mint = '${ADDRESSES.solana.SOL}'
        AND r.raw_amount > 0
        AND ${timeRange('r')}
    ),
    programs AS (
      -- programs called by those transactions, and whether they succeeded
      SELECT i.txn_id,
        MAX(IFF(i.program_id = '${JUPITER_V6}', 1, 0)) AS has_jupiter,
        MAX(IFF(i.program_id NOT IN ('${SYSTEM_PROGRAM}', '${COMPUTE_BUDGET_PROGRAM}'), 1, 0)) AS has_other_program,
        COUNT_IF(i.parent_tx_success = FALSE) AS failed_instructions,
        COUNT_IF(i.parent_tx_success IS NULL) AS unknown_status
      FROM solana.raw.instructions i
      WHERE i.txn_id IN (SELECT txn_id FROM inflows)
        AND ${timeRange('i')}
      GROUP BY i.txn_id
    ),
    legs AS (
      -- every asset movement in those transactions
      SELECT t.txn_id,
        COUNT(*) AS legs,
        SUM(IFF(${fromSigner('t')}, 1, 0)) AS signer_legs,
        SUM(IFF(${fromSigner('t')}, TRY_TO_DECIMAL(t.raw_amount_str, 38, 0), 0)) AS signer_lamports
      FROM solana.assets.transfers t
      WHERE t.txn_id IN (SELECT txn_id FROM inflows)
        AND ${timeRange('t')}
      GROUP BY t.txn_id
    ),
    classified AS (
      SELECT f.lamports,
        CASE
          WHEN p.txn_id IS NULL OR l.txn_id IS NULL OR p.unknown_status > 0 OR f.lamports IS NULL THEN 'unrecognised'
          WHEN p.failed_instructions > 0 THEN 'failed'
          WHEN f.signer = '${TREASURY}' THEN 'treasury_signed'
          WHEN f.from_signer = 0 THEN 'unrecognised'
          -- Peep's fee is the single SOL transfer from the swap's signer to the treasury
          WHEN p.has_jupiter = 1 AND f.tx_inflows = 1 THEN 'trading_fee'
          WHEN p.has_jupiter = 1 THEN 'unrecognised'
          WHEN p.has_other_program = 0 AND l.legs = 2 AND l.signer_legs = 2
            AND f.lamports = FLOOR(l.signer_lamports * ${GROUP_FEE_BPS} / 10000) THEN 'group_join_fee'
          -- not revenue: a plain gift or operator funding, whoever sends it
          WHEN l.legs = 1 THEN 'direct_transfer'
          ELSE 'unrecognised'
        END AS kind
      FROM inflows f
      LEFT JOIN programs p ON p.txn_id = f.txn_id
      LEFT JOIN legs l ON l.txn_id = f.txn_id
    )
    SELECT
      COUNT(*) AS inflows,
      COUNT_IF(kind = 'unrecognised') AS unrecognised,
      TO_VARCHAR(SUM(IFF(kind = 'trading_fee', lamports, 0))) AS trading_fees,
      TO_VARCHAR(SUM(IFF(kind = 'group_join_fee', lamports, 0))) AS group_join_fees
    FROM classified
  `);

  const period = `${options.startTimestamp}-${options.endTimestamp}`;
  // An aggregate without GROUP BY returns exactly one row; anything else is a failed query.
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : undefined;
  const inflows = Number(row?.inflows);
  const unrecognised = Number(row?.unrecognised);
  if (!row || !Number.isInteger(inflows) || !Number.isInteger(unrecognised))
    throw new Error(`peep: unexpected Allium result for ${period}`);
  if (unrecognised > 0)
    throw new Error(`peep: ${unrecognised} of ${inflows} treasury SOL inflows in ${period} match no known shape (trading fee, paid group join, direct transfer, treasury-signed)`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // No SOL reached the treasury in the window: nothing to add.
  if (inflows > 0) {
    if (row.trading_fees == null || row.group_join_fees == null)
      throw new Error(`peep: missing fee sums in the Allium result for ${period}`);
    dailyFees.add(ADDRESSES.solana.SOL, row.trading_fees, METRIC.TRADING_FEES);
    dailyFees.add(ADDRESSES.solana.SOL, row.group_join_fees, LABELS.GROUP_JOIN_FEES);
    dailyRevenue.add(ADDRESSES.solana.SOL, row.trading_fees, LABELS.TRADING_FEES_TO_TREASURY);
    dailyRevenue.add(ADDRESSES.solana.SOL, row.group_join_fees, LABELS.GROUP_JOIN_FEES_TO_TREASURY);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    // Peep pays no part of these fees to referrers (referral payouts are not made), integrators or Jupiter.
    dailySupplySideRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-09-30', // first trading fee: 5ZPez... at 2026-09-30T17:23:47Z
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: 'SOL paid to Peep by its users: the 0.75% fee on swaps between SOL and a token made in Peep, and Peep\'s 5% share of each paid group join. The other 95% of a group join is the price of the group, paid by the member straight to the group\'s creator, and is not counted. Swaps between SOL and USDC/USDT, token-to-token swaps and tips carry no Peep fee.',
    UserFees: 'SOL paid by Peep users: the 0.75% fee on swaps between SOL and a token, and Peep\'s 5% share of each paid group join.',
    Revenue: 'SOL kept by Peep: the whole 0.75% fee on swaps between SOL and a token, and Peep\'s whole 5% share of each paid group join.',
    ProtocolRevenue: 'SOL received by the Peep treasury: the whole 0.75% fee on swaps between SOL and a token, and Peep\'s 5% share of each paid group join.',
    SupplySideRevenue: 'None: Peep shares no part of its swap fees or group join fees with referrers, integrators or Jupiter.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: '0.75% fee on each swap between SOL and a token made in Peep, paid in SOL by the user to the Peep treasury inside the swap transaction and rounded down to the lamport. On a sell it is taken on the minimum SOL out.',
      [LABELS.GROUP_JOIN_FEES]: 'Peep\'s 5% (rounded down) of each paid group join, paid in SOL by the joining member to the Peep treasury. The other 95% goes from the member straight to the group\'s creator as the price of the group; Peep is not a party to that sale, so it is not counted.',
    },
    UserFees: {
      [METRIC.TRADING_FEES]: '0.75% fee on each swap between SOL and a token made in Peep, paid by the user.',
      [LABELS.GROUP_JOIN_FEES]: 'Peep\'s 5% of each paid group join, paid by the joining member.',
    },
    Revenue: {
      [LABELS.TRADING_FEES_TO_TREASURY]: 'The whole 0.75% swap fee, kept by Peep.',
      [LABELS.GROUP_JOIN_FEES_TO_TREASURY]: 'Peep\'s whole 5% share of each paid group join, kept by Peep.',
    },
    ProtocolRevenue: {
      [LABELS.TRADING_FEES_TO_TREASURY]: 'The whole 0.75% swap fee, sent to the Peep treasury.',
      [LABELS.GROUP_JOIN_FEES_TO_TREASURY]: 'Peep\'s 5% share of each paid group join, sent to the Peep treasury.',
    },
  },
};

export default adapter;
