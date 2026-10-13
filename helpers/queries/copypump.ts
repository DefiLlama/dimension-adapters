import ADDRESSES from '../coreAssets.json'
// copypump (https://www.copypumpfun.com) -- Telegram copy-trading bot on pump.fun, Solana only.
//
// Every user gets one Solana wallet. The bot pays every transaction fee from a single fee-payer
// account and co-signs with the user's wallet, so "first signer = the fee payer" is the on-chain
// footprint of a copypump transaction. The service fee is collected in a SEPARATE transaction
// from the trade (batched per user by the collector), always as a USDC transfer to the treasury.
//
// All addresses below are public on-chain identifiers, also published on
// https://dune.com/polycool/copypumpfun and https://www.copypumpfun.com/data.

// Treasury receiving service fees (USDC).
export const TREASURY_SOL = "BjHYEPvpHj1CgmhsJKzmSCmDbtzoy2nYu7XTr5nLu1Ev";
// Fee payer: first signer of every copypump transaction; pays its signature fee, priority fee and
// the rent of the token accounts the route creates.
export const FEE_PAYER_SOL = "DQg2Uxvbh4JJD6bFHPCsoLJ9SGgNv1qkvksHy8MVfV7D";
// Stablecoin the service fee is paid in.
export const USDC_SOL = ADDRESSES.solana.USDC;
// Wrapped SOL: the price feed used to value the fee payer's SOL spend.
export const WSOL = ADDRESSES.solana.SOL;

// Dune partitions tokens_solana.transfers / solana.* / dex_solana.trades by block_date: TIME_RANGE
// (block_time) alone does not prune partitions, so every query also carries a block_date bound.
export const partitionRange = (startTimestamp: number, endTimestamp: number) =>
  `block_date >= cast(from_unixtime(${startTimestamp}) as date) AND block_date <= cast(from_unixtime(${endTimestamp}) as date)`;
export const withPartition = (sql: string, options: { startTimestamp: number; endTimestamp: number }) =>
  sql
    .split("PARTITION_RANGE").join(partitionRange(options.startTimestamp, options.endTimestamp))
    .split("PRICE_RANGE").join(
      `timestamp >= cast(from_unixtime(${options.startTimestamp}) as date) - interval '2' day AND timestamp <= cast(from_unixtime(${options.endTimestamp}) as date)`,
    );

// One row: fees_usd (USDC into the treasury) and gas_usd (SOL spent by the fee payer).
export const FEES_SQL = `
WITH
  fees AS (
    SELECT SUM(amount_usd) AS fees_usd
    FROM tokens_solana.transfers
    WHERE PARTITION_RANGE AND TIME_RANGE
      AND to_owner = '${TREASURY_SOL}'
      AND token_mint_address = '${USDC_SOL}'
  ),
  -- SOL that LEFT the fee payer's account in its own transactions (signature and priority fees,
  -- rent of the token accounts it creates). A transaction where its balance went UP is a top-up
  -- (SOL sent from the treasury) and is not a cost. Failed transactions still pay their fee.
  gas_native AS (
    SELECT SUM(CASE WHEN pre_balances[1] > post_balances[1]
                    THEN CAST(pre_balances[1] AS DOUBLE) - CAST(post_balances[1] AS DOUBLE) ELSE 0 END) / 1e9 AS sol
    FROM solana.transactions
    WHERE PARTITION_RANGE AND TIME_RANGE
      AND signer = '${FEE_PAYER_SOL}'
  ),
  px AS (
    SELECT max_by(price, timestamp) AS price FROM prices.day
    WHERE blockchain = 'solana' AND contract_address = from_base58('${WSOL}') AND PRICE_RANGE
  )
SELECT
  COALESCE(fees.fees_usd, 0) AS fees_usd,
  COALESCE(gas_native.sol, 0) * px.price AS gas_usd
FROM fees, gas_native, px
`;

// One row: volume_usd and trades. A copied trade is a transaction signed by the fee payer with at
// least one DEX swap; a multi-hop route (USDC -> SOL -> token) is one trade whose hops carry the
// same value, so one USD value per transaction (its largest hop), never the sum of hops.
export const VOLUME_SQL = `
WITH
  ours AS (
    SELECT id
    FROM solana.transactions
    WHERE PARTITION_RANGE AND TIME_RANGE
      AND signer = '${FEE_PAYER_SOL}'
      AND success
  ),
  swaps AS (
    SELECT tx_id, amount_usd
    FROM dex_solana.trades
    WHERE PARTITION_RANGE AND TIME_RANGE
  ),
  per_tx AS (
    SELECT s.tx_id, MAX(s.amount_usd) AS usd
    FROM swaps s
    JOIN ours o ON o.id = s.tx_id
    GROUP BY 1
  )
SELECT COALESCE(SUM(usd), 0) AS volume_usd, COUNT(*) AS trades FROM per_tx
`;
