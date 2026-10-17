// DEEP (https://deepliquidity.fun): a Solana launchpad. Tokens launch on a bonding curve (the Deep
// Curve program) and trade there against SOL until the curve is sold out; the liquidity then moves
// to a DeepSwap pool (the `deepswap` adapter).
// Docs: https://docs.deepliquidity.fun/docs
//
// Both programs report every trade in an Anchor event (a `Program data:` log line) with the fee of
// that trade already split by recipient, so volume and fees are the programs' own numbers: no rate
// is assumed. The events are read from the transactions' log messages on Allium.
// Event layouts and fee maths: https://github.com/Deep-Liquidity/deep-sdk (docs/INTEGRATORS.md,
// sections 5 and 7; the Anchor IDLs are in packages/sdk/idl).
import ADDRESSES from "../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const DEEP_CURVE_PROGRAM = "7czURwVLkQpcF1HVhhZU5GGzvPA8YniogZY1BhZHCDtA";

const FEE_VAULT = "8a2XakVBzdMRJ6gMY6u8mvebzJGgbmG6nVBVPB8uwBVZ";
export const FEE_VAULT_WSOL = "EcnANJ5kYr7a8LpiH4ETkSGD3r7SDdicUn9ttf5MWCir";
export const GRADUATION_PAYER = "GwW8P2V5mxfPosGEwtcNuUuzx6FVdzPZrapApn8ufYZF";

const EVENT = {
  Trade: "BDDB7FD34EE661EE",
  LaunchFeeCharged: "E2E3321153D20E95",
  Graduated: "33F142328CF59CC0",
};

const LABEL = {
  CurveProtocolFees: "Bonding Curve Trading Fees",
  CurveCreatorRewards: "Bonding Curve Creator Rewards",
  CurveHolderRewards: "Bonding Curve Holder Rewards",
  LaunchFees: "Token Launch Fees",
  MigrationFees: "Migration Fees",
};

export const u8 = (column: string, offset: number) => `SUBSTR(${column}, ${2 * offset + 1}, 2)`;
export const u64 = (column: string, offset: number) =>
  `TO_NUMBER(${[7, 6, 5, 4, 3, 2, 1, 0].map((i) => u8(column, offset + i)).join(" || ")}, 'XXXXXXXXXXXXXXXX')`;

const timeFilter = (options: FetchOptions, alias = "") =>
  `${alias}block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND ${alias}block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

export function programEventsSql(programId: string, options: FetchOptions): string {
  return `
  WITH program_calls AS (
    -- every call of the program, by a user or by another program
    SELECT txn_id, COUNT(*) AS calls
    FROM (
      SELECT txn_id FROM solana.raw.instructions WHERE ${timeFilter(options)} AND program_id = '${programId}'
      UNION ALL
      SELECT txn_id FROM solana.raw.inner_instructions WHERE ${timeFilter(options)} AND program_id = '${programId}'
    )
    GROUP BY txn_id
  ),
  program_txs AS (
    SELECT t.txn_id, t.log_messages, c.calls
    FROM solana.raw.transactions t
    JOIN program_calls c ON c.txn_id = t.txn_id
    WHERE ${timeFilter(options, "t.")} AND t.success
  ),
  log_lines AS (
    -- The runtime writes "Program <id> invoke [<depth>]" when a program is called and "Program <id> success"
    -- when it returns. A program's own lines read "Program log:", "Program data:" or "Program return:", so
    -- they cannot pass for these. The network keeps about 10 kB of logs and then writes "Log truncated".
    SELECT t.txn_id, t.calls, l.index AS line, l.value::STRING AS msg,
      STARTSWITH(msg, 'Program ') AND NOT ENDSWITH(SPLIT_PART(msg, ' ', 2), ':') AS by_runtime,
      IFF(by_runtime AND SPLIT_PART(msg, ' ', 3) = 'invoke', SPLIT_PART(msg, ' ', 2), NULL) AS invoked,
      CASE WHEN invoked IS NOT NULL THEN 1 WHEN by_runtime AND SPLIT_PART(msg, ' ', 3) IN ('success', 'failed:') THEN -1 ELSE 0 END AS step,
      MIN(IFF(l.value::STRING = 'Log truncated', l.index, NULL)) OVER (PARTITION BY t.txn_id) AS truncated_at
    FROM program_txs t, LATERAL FLATTEN(input => t.log_messages) l
  ),
  log_depths AS (
    -- depth: that of the call a line belongs to; call_no: calls numbered in log order, like the instructions
    SELECT *,
      SUM(step) OVER (PARTITION BY txn_id ORDER BY line ROWS UNBOUNDED PRECEDING) + IFF(step = -1, 1, 0) AS depth,
      SUM(IFF(step = 1, 1, 0)) OVER (PARTITION BY txn_id ORDER BY line ROWS UNBOUNDED PRECEDING) - 1 AS call_no
    FROM log_lines
    WHERE truncated_at IS NULL OR line < truncated_at
  ),
  log_calls AS (
    -- A program can log arbitrary bytes, so an event is only trusted from the program that was running
    -- when it was written: the latest call opened at the line's depth.
    SELECT txn_id, calls, truncated_at, msg, step,
      LAST_VALUE(invoked) IGNORE NULLS OVER (PARTITION BY txn_id, depth ORDER BY line ROWS UNBOUNDED PRECEDING) AS program,
      LAST_VALUE(IFF(step = 1, call_no, NULL)) IGNORE NULLS OVER (PARTITION BY txn_id, depth ORDER BY line ROWS UNBOUNDED PRECEDING) AS frame
    FROM log_depths
  ),
  program_events AS (
    SELECT txn_id, frame, HEX_ENCODE(TRY_BASE64_DECODE_BINARY(SPLIT_PART(msg, ' ', 3))) AS data
    FROM log_calls
    WHERE program = '${programId}' AND STARTSWITH(msg, 'Program data: ')
  ),
  cut_txs AS (
    -- logs cut before every call of the program had returned: the events of the other calls are lost
    SELECT txn_id
    FROM log_calls
    WHERE truncated_at IS NOT NULL
    GROUP BY txn_id, calls
    HAVING COUNT_IF(step = -1 AND program = '${programId}') < calls
  ),
  vault_transfers AS (
    -- System Program transfers of SOL to the fee vault or its wrapped SOL account (account-creation
    -- rent is a different type and is left out)
    SELECT txn_id, from_address, to_address, raw_amount
    FROM solana.assets.transfers
    WHERE ${timeFilter(options)} AND transfer_type = 'sol_transfer' AND type = 'transfer'
      AND to_address IN ('${FEE_VAULT}', '${FEE_VAULT_WSOL}')
  ),
  checks AS (
    SELECT
      (SELECT COUNT(*) FROM cut_txs) AS cut_txs,
      (SELECT MIN(txn_id) FROM cut_txs) AS cut_tx,
      -- the transfers table, built from the raw ones, already holds blocks past the window, so a quiet
      -- window is not ingestion lag
      EXISTS (SELECT 1 FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
  )`;
}

export function assertComplete(row: any, adapter: string, options: FetchOptions) {
  if (!row) throw new Error(`${adapter}: empty Allium response`);
  if (!row.indexed)
    throw new Error(`${adapter}: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  if (Number(row.cut_txs) > 0)
    throw new Error(`${adapter}: the logs of ${row.cut_tx} (and ${Number(row.cut_txs) - 1} other transactions) were cut before every call returned, their events cannot be read`);
}

const fetch = async (options: FetchOptions) => {
  const [row] = await queryAllium(`${programEventsSql(DEEP_CURVE_PROGRAM, options)},
  trades AS (
    -- TradeEvent: is_buy u8 @72 | sol_amount u64 @73 | protocol_fee u64 @89 | creator_fee u64 @97 | holder_fee u64 @146
    SELECT ${u8("data", 72)} = '01' AS is_buy, ${u64("data", 73)} AS sol_amount, ${u64("data", 89)} AS protocol_fee,
      ${u64("data", 97)} AS creator_fee, ${u64("data", 146)} AS holder_fee
    FROM program_events
    WHERE STARTSWITH(data, '${EVENT.Trade}')
  )
  SELECT
    -- sol_amount is what the buyer paid, fees included, or what the seller received, fees already
    -- taken: the fees are added back so both sides are gross
    (SELECT SUM(IFF(is_buy, sol_amount, sol_amount + protocol_fee + creator_fee + holder_fee)) FROM trades)::VARCHAR AS volume,
    (SELECT SUM(protocol_fee) FROM trades)::VARCHAR AS protocol_fees,
    (SELECT SUM(creator_fee) FROM trades)::VARCHAR AS creator_rewards,
    (SELECT SUM(holder_fee) FROM trades)::VARCHAR AS holder_rewards,
    -- LaunchFeeCharged: lamports u64 @74
    (SELECT SUM(${u64("data", 74)}) FROM program_events WHERE STARTSWITH(data, '${EVENT.LaunchFeeCharged}'))::VARCHAR AS launch_fees,
    -- The migration fee (a share of the SOL the curve raised) first pays the network rent of the new
    -- pool's accounts; DEEP keeps what the graduation then sends to the fee vault, including the pool
    -- creation fee DeepSwap charges it.
    (SELECT SUM(raw_amount) FROM vault_transfers
      WHERE from_address = '${GRADUATION_PAYER}'
        AND txn_id IN (SELECT txn_id FROM program_events WHERE STARTSWITH(data, '${EVENT.Graduated}')))::VARCHAR AS migration_fees,
    checks.*
  FROM checks`);
  assertComplete(row, "deep-launchpad", options);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const SOL = ADDRESSES.solana.SOL;

  // a sum over no rows is absent from the response: nothing of that kind happened in an indexed window
  dailyVolume.add(SOL, row.volume ?? 0);
  dailyFees.add(SOL, row.protocol_fees ?? 0, LABEL.CurveProtocolFees);
  dailyRevenue.add(SOL, row.protocol_fees ?? 0, LABEL.CurveProtocolFees);
  dailyFees.add(SOL, row.creator_rewards ?? 0, LABEL.CurveCreatorRewards);
  dailySupplySideRevenue.add(SOL, row.creator_rewards ?? 0, LABEL.CurveCreatorRewards);
  dailyFees.add(SOL, row.holder_rewards ?? 0, LABEL.CurveHolderRewards);
  dailySupplySideRevenue.add(SOL, row.holder_rewards ?? 0, LABEL.CurveHolderRewards);
  dailyFees.add(SOL, row.launch_fees ?? 0, LABEL.LaunchFees);
  dailyRevenue.add(SOL, row.launch_fees ?? 0, LABEL.LaunchFees);
  dailyFees.add(SOL, row.migration_fees ?? 0, LABEL.MigrationFees);
  dailyRevenue.add(SOL, row.migration_fees ?? 0, LABEL.MigrationFees);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "SOL paid by buyers and SOL paid out to sellers on the bonding curves, before fees.",
  Fees: "Everything charged on the launchpad: DEEP's fee on each bonding-curve buy and sell (1.25%), the reward fee a token's creator chose at launch (0% to 5% of each trade), the fee to launch a token ($2, paid in SOL) and the migration fee taken from the SOL a curve raised when its token graduates (1%, less the network rent of the new pool's accounts).",
  Revenue: "DEEP's share: its 1.25% fee on bonding-curve trades, the token launch fees and the migration fees. Reward fees are not included.",
  ProtocolRevenue: "DEEP's 1.25% fee on bonding-curve trades, the token launch fees and the migration fees, all paid into DEEP's on-chain fee vault, which pays 10% to the team that builds DEEP and 90% to the DEEP treasury.",
  SupplySideRevenue: "The reward fee of each token, paid in full to the token's creator or, for a Holder Rewards token, to the holders of that token.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.CurveProtocolFees]: "DEEP's fee on each bonding-curve buy and sell (1.25%).",
    [LABEL.CurveCreatorRewards]: "The reward fee of Creator Rewards tokens (a rate the creator chose at launch, up to 5% of each trade).",
    [LABEL.CurveHolderRewards]: "The reward fee of Holder Rewards tokens (a rate the creator chose at launch, up to 5% of each trade).",
    [LABEL.LaunchFees]: "The fee to launch a token ($2, paid in SOL at the Pyth SOL/USD price).",
    [LABEL.MigrationFees]: "The part of the SOL a curve raised that DEEP keeps when the token graduates to DeepSwap (1%, less the network rent of the new pool's accounts).",
  },
  Revenue: {
    [LABEL.CurveProtocolFees]: "DEEP's fee on each bonding-curve buy and sell (1.25%).",
    [LABEL.LaunchFees]: "The fee to launch a token.",
    [LABEL.MigrationFees]: "The migration fee DEEP keeps when a token graduates.",
  },
  ProtocolRevenue: {
    [LABEL.CurveProtocolFees]: "DEEP's fee on each bonding-curve buy and sell (1.25%), paid into DEEP's fee vault.",
    [LABEL.LaunchFees]: "The fee to launch a token, paid into DEEP's fee vault.",
    [LABEL.MigrationFees]: "The migration fee DEEP keeps when a token graduates, paid into DEEP's fee vault.",
  },
  SupplySideRevenue: {
    [LABEL.CurveCreatorRewards]: "Reward fees paid to the creators of Creator Rewards tokens.",
    [LABEL.CurveHolderRewards]: "Reward fees paid to the holders of Holder Rewards tokens.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-08",
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
