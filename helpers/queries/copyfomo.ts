// copyfomo (https://www.copyfomo.com) -- Telegram copy-trading bot.
//
// Every user gets one ERC-4337 smart account (Alchemy LightAccount v1.1.0, deployed
// through the public LightAccountFactory) that is reused on every EVM chain, plus one
// Solana wallet. The bot pays every Solana transaction fee from a single fee-payer
// account and co-signs with the user's wallet, so on Solana "signed by the fee payer"
// is the on-chain footprint of a copyfomo transaction. On EVM chains the footprint is
// "LightAccountFactory-created account that has paid the copyfomo treasury".
//
// Service fees are collected in a SEPARATE transaction from the trade (batched per
// user by the collector), always as a stablecoin transfer to the treasury address.
//
// All addresses below are public on-chain identifiers.

// Treasury receiving service fees on every EVM chain (same address on base, bnb, robinhood).
export const TREASURY_EVM = "0xe26fbe48ba4f9ad167e66106070fc6966dd913e0";
// Treasury receiving service fees on Solana (USDC).
export const TREASURY_SOL = "PRYvrMW7TBLGydidijJviy2oC3nQHP2zAWBbeqVSNAb";
// Solana fee payer: signs and pays every copyfomo Solana transaction.
export const FEE_PAYER_SOL = "4pF8Qxdu2pDjWdx1tzGn7or3dbyVn1DQpqZKJx7ALGzH";
// Alchemy LightAccountFactory v1.1.0 (public, same address on every EVM chain).
export const LIGHT_ACCOUNT_FACTORY = "0x00004ec70002a32400f8ae005a26081065620d20";
// ERC-4337 EntryPoint v0.6 and the copyfomo bundler wallets that pay the gas of every user
// operation (the user is billed back in stablecoins together with the service fee).
export const ENTRYPOINT = "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789";
export const BUNDLER_EMITTERS = [
  "0x6447aad0827975425f23811ce660275a9aa1b15a",
  "0xde05194a1614f39284a984927c65f6b15c1a4fc0",
  "0x80f96cb0d877e8e37edd6e9c3e85c41eef0bc8b6",
  "0xc3439e308478e77296e1e3c623f17f79ec8603dc",
];
// $COPY, the copyfomo token, launched 2026-09-02 on the Pons launchpad on Robinhood Chain
// (https://www.ponsfamily.com/launchpad/0x63Ee90921EAC3c3F87961C17556BB3eBDF2490A9). It trades in
// one Uniswap v4 pool, COPY/COIN, whose Pons hook takes 3% of every swap: a 1% hook fee (70% to
// the creator, 30% to Pons) plus a 2% creator tax -- 2.7% of the volume goes to the creator
// (hook launch config, read on-chain: hookFeeBps 100, protocolFeeShareBps 3000, creatorTaxBps 200).
// The hook accrues the fees, Pons sweeps them into COIN and credits its fee escrow, from which
// copyfomo claims them later (claims are batched, so they are NOT what is counted here).
export const COPY_TOKEN = "0x63ee90921eac3c3f87961c17556bb3ebdf2490a9";
export const COIN_ROBINHOOD = "0x6330d8c3178a418788df01a47479c0ce7ccf450b"; // 18 decimals
export const PONS_FEE_ESCROW = "0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e";
export const COPY_CREATOR_FEE_RATE = 0.027;
// Uniswap v4 PoolManager on Robinhood Chain, its Swap event and the COPY/COIN pool id
// (currency0 = COIN, currency1 = COPY; amount0 of the Swap event is the COIN leg).
export const UNIV4_POOL_MANAGER_ROBINHOOD = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
export const UNIV4_SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
export const COPY_POOL_ID = "0xd1426746cf744acf047a783d8246489f1e82afa9a98d70be6b3fe8eb8da5a651";
// copyfomo creator wallets: the launch (dev) wallet, then, since 2026-09-14, the buyback smart
// account that claims the creator fees, buys $COPY with part of them and burns it.
export const COPY_CREATOR_WALLETS = [
  "0xe2e8f4eea9dcba0ba83a35d8598e3451fc22c66b",
  "0xe9d4523c74e502a4de21c6be197aa536d52d9e6e",
];
// First day of the buyback & burn programme (https://www.copyfomo.com/data). The dev wallet also
// bought $COPY at launch (2026-09-02): that is the initial position, not a buyback.
export const BUYBACK_SINCE = "2026-09-11";
// ERC20Burnable.burn emits Transfer(wallet, 0x0); 0xdead is checked too.
export const BURN_ADDRESSES = ["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead"];
// The programme started with three manual buys from the launch wallet on 2026-09-11
// (10.853M $COPY for 8.287 COIN + 2,500 USDG), burned the next day in one transaction:
// 0xb0a4b14227d82bc043ef53f2814384ce8869599372d863a5b7c8e300d83b85d6 (10.852M $COPY, 2026-09-12 09:48 UTC).
// The burn is not in the buying transaction, so these three are listed explicitly. Every buy since
// the buyback account took over (2026-09-14) burns in the same transaction and needs no listing.
export const MANUAL_BUYBACKS_BURNED_LATER = [
  "0x6749cd8fe2e462ed7adc56071979a9d22b0df096b8d82f71f202bf54628fcfce",
  "0xc80d6731c03ae6592ea2fb3e1aa2a630b5d1b57525be2c1700c9e5b0e0de9173",
  "0xa7250917ea6ef9eeab9d6a3eef4f66a10a26388251df80e194670634576abf2d",
];
// Priced against Dune's prices.day to convert the bundler's native gas spend (ETH on
// Base/Robinhood, BNB on BNB Chain) to USD.
const WETH_ETHEREUM = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WBNB_BNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";

// Stablecoins users trade with (the "cash" leg of every trade).
export const STABLES_EVM: Record<string, string[]> = {
  base: ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"], // USDC
  bnb: ["0x55d398326f99059ff775485246999027b3197955", "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"], // USDT, USDC
};
// Robinhood chain: USDG (Global Dollar), 6 decimals, not covered by tokens.transfers.
export const USDG_ROBINHOOD = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
export const STABLES_SOL = [
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
];
export const WSOL = "So11111111111111111111111111111111111111112";

// Dune partitions tokens.transfers / solana.* by block_date: TIME_RANGE (block_time) alone
// does not prune partitions, so every query also carries a block_date bound. The adapter
// substitutes PARTITION_RANGE with the day window (see partitionRange()).
export const partitionRange = (startTimestamp: number, endTimestamp: number) =>
  `block_date >= cast(from_unixtime(${startTimestamp}) as date) AND block_date <= cast(from_unixtime(${endTimestamp}) as date)`;
export const withPartition = (sql: string, options: { startTimestamp: number; endTimestamp: number }) =>
  sql
    .split("PARTITION_RANGE").join(partitionRange(options.startTimestamp, options.endTimestamp))
    .split("DISCOVERY_END_DATE").join(`cast(from_unixtime(${options.endTimestamp}) as date)`)
    .split("DISCOVERY_END_TS").join(`from_unixtime(${options.endTimestamp})`)
    .split("PRICE_RANGE").join(
      `timestamp >= cast(from_unixtime(${options.startTimestamp}) as date) - interval '2' day AND timestamp <= cast(from_unixtime(${options.endTimestamp}) as date)`,
    );

const hexList = (arr: string[]) => arr.join(", ");
const strList = (arr: string[]) => arr.map((a) => `'${a}'`).join(", ");

const TRES_EVM = hexList([TREASURY_EVM]);
const STABLES_BASE_BNB = hexList([...STABLES_EVM.base, ...STABLES_EVM.bnb]);
const EMITTERS = hexList(BUNDLER_EMITTERS);
const CREATOR_WALLETS = hexList(COPY_CREATOR_WALLETS);
const BURN_ADDRS = hexList(BURN_ADDRESSES);
const MANUAL_BUYBACK_TXS = hexList(MANUAL_BUYBACKS_BURNED_LATER);

// Wallet sets. Cheap by construction: only addresses that sent a stablecoin to the
// treasury up to the end of the requested window are considered (no future data), then
// kept only if they are contracts created by the LightAccountFactory (this removes
// exchanges/solvers that ever touched the treasury).
const EVM_WALLETS_CTE = `
  contracts AS (
    SELECT 'base' AS blockchain, address FROM base.creation_traces WHERE "from" = ${LIGHT_ACCOUNT_FACTORY} AND block_time >= TIMESTAMP '2026-08-01'
    UNION ALL SELECT 'bnb', address FROM bnb.creation_traces WHERE "from" = ${LIGHT_ACCOUNT_FACTORY} AND block_time >= TIMESTAMP '2026-08-01'
  ),
  evm_wallets AS (
    SELECT DISTINCT t.blockchain, t."from" AS wallet
    FROM tokens.transfers t
    JOIN contracts c ON c.blockchain = t.blockchain AND c.address = t."from"
    WHERE t.blockchain IN ('base', 'bnb')
      AND t.block_date >= DATE '2026-08-20' AND t.block_date <= DISCOVERY_END_DATE
      AND t."to" IN (${TRES_EVM})
  ),
  rh_wallets AS (
    SELECT DISTINCT t."from" AS wallet
    FROM erc20_robinhood.evt_Transfer t
    JOIN robinhood.creation_traces c ON c.address = t."from" AND c."from" = ${LIGHT_ACCOUNT_FACTORY} AND c.block_time >= TIMESTAMP '2026-08-01'
    WHERE t.evt_block_time >= TIMESTAMP '2026-08-20' AND t.evt_block_time <= DISCOVERY_END_TS
      AND t."to" IN (${TRES_EVM})
  )`;

/**
 * Fees: every stablecoin transfer INTO the treasury, per chain, for TIME_RANGE, and the gas
 * the bundler paid for user operations over the same window (subtracted by the adapter).
 * Referral: stablecoin transfers FROM the treasury back to copyfomo wallets
 * (referral rewards paid to referrers) -- the supply-side share.
 * Creator: $COPY creator fees accrued on every swap of the COPY/COIN pool (robinhood only),
 * and the buyback & burn funded by them (holders' share).
 */
export const FEES_SQL = `
WITH ${EVM_WALLETS_CTE},
  evm_in AS (
    SELECT blockchain AS chain, SUM(amount_usd) AS fees_usd
    FROM tokens.transfers
    WHERE PARTITION_RANGE AND TIME_RANGE
      AND blockchain IN ('base', 'bnb')
      AND "to" IN (${TRES_EVM})
      AND contract_address IN (${STABLES_BASE_BNB})
    GROUP BY 1
  ),
  evm_out AS (
    SELECT t.blockchain AS chain, SUM(t.amount_usd) AS referral_usd
    FROM tokens.transfers t
    JOIN evm_wallets w ON w.blockchain = t.blockchain AND w.wallet = t."to"
    WHERE PARTITION_RANGE AND TIME_RANGE
      AND t.blockchain IN ('base', 'bnb')
      AND t."from" IN (${TRES_EVM})
      AND t.contract_address IN (${STABLES_BASE_BNB})
    GROUP BY 1
  ),
  rh AS (
    SELECT evt_block_time AS block_time, "from", "to", value / 1e6 AS usd
    FROM erc20_robinhood.evt_Transfer
    WHERE contract_address = ${USDG_ROBINHOOD}
  ),
  rh_in AS (
    SELECT 'robinhood' AS chain, SUM(usd) AS fees_usd FROM rh WHERE TIME_RANGE AND "to" IN (${TRES_EVM})
  ),
  rh_out AS (
    SELECT 'robinhood' AS chain, SUM(rh.usd) AS referral_usd
    FROM rh JOIN rh_wallets w ON w.wallet = rh."to"
    WHERE TIME_RANGE AND rh."from" IN (${TRES_EVM})
  ),
  sol_in AS (
    SELECT 'solana' AS chain, SUM(amount_usd) AS fees_usd
    FROM tokens_solana.transfers
    WHERE PARTITION_RANGE AND TIME_RANGE
      AND to_owner = '${TREASURY_SOL}'
      AND token_mint_address IN (${strList(STABLES_SOL)})
  ),
  -- Unlike evm_out/rh_out, not scoped to identified user wallets: a Solana wallet roster
  -- costs an unpartitioned full-history scan of solana.transactions (measured 14x the
  -- credits, 2x the runtime of the rest of this query combined). The treasury has never
  -- sent a stablecoin out on Solana (checked over the full adapter history), so this is a
  -- $0 risk today; add the scoped join back if that ever changes.
  sol_out AS (
    SELECT 'solana' AS chain, SUM(amount_usd) AS referral_usd
    FROM tokens_solana.transfers
    WHERE PARTITION_RANGE AND TIME_RANGE
      AND from_owner = '${TREASURY_SOL}'
      AND token_mint_address IN (${strList(STABLES_SOL)})
  ),
  -- Gas paid by the bundler wallets for user operations (handleOps on the EntryPoint),
  -- priced with the daily WETH / WBNB price. This is the cost copyfomo.com/data subtracts.
  gas_native AS (
    SELECT 'base' AS chain, 'eth' AS sym, SUM(CAST(gas_used AS DOUBLE) * CAST(gas_price AS DOUBLE)) / 1e18 AS native
    FROM base.transactions WHERE PARTITION_RANGE AND TIME_RANGE AND "from" IN (${EMITTERS}) AND "to" = ${ENTRYPOINT}
    UNION ALL
    SELECT 'robinhood', 'eth', SUM(CAST(gas_used AS DOUBLE) * CAST(gas_price AS DOUBLE)) / 1e18
    FROM robinhood.transactions WHERE PARTITION_RANGE AND TIME_RANGE AND "from" IN (${EMITTERS}) AND "to" = ${ENTRYPOINT}
    UNION ALL
    SELECT 'bnb', 'bnb', SUM(CAST(gas_used AS DOUBLE) * CAST(gas_price AS DOUBLE)) / 1e18
    FROM bnb.transactions WHERE PARTITION_RANGE AND TIME_RANGE AND "from" IN (${EMITTERS}) AND "to" = ${ENTRYPOINT}
  ),
  px AS (
    SELECT 'eth' AS sym, max_by(price, timestamp) AS price FROM prices.day
    WHERE blockchain = 'ethereum' AND contract_address = ${WETH_ETHEREUM} AND PRICE_RANGE
    UNION ALL
    SELECT 'bnb', max_by(price, timestamp) FROM prices.day
    WHERE blockchain = 'bnb' AND contract_address = ${WBNB_BNB} AND PRICE_RANGE
  ),
  gas AS (
    SELECT g.chain, SUM(g.native * p.price) AS gas_usd FROM gas_native g JOIN px p ON p.sym = g.sym GROUP BY 1
  ),
  fees AS (
    SELECT * FROM evm_in UNION ALL SELECT * FROM rh_in UNION ALL SELECT * FROM sol_in
  ),
  referral AS (
    SELECT * FROM evm_out UNION ALL SELECT * FROM rh_out UNION ALL SELECT * FROM sol_out
  ),
  -- $COPY creator fees (Robinhood Chain): 2.7% of the COIN leg of every swap of the COPY/COIN
  -- pool (raw PoolManager Swap logs, the hook itself is not decoded on Dune), valued at the hourly
  -- COIN price (daily price as fallback), on the day of the trade. Buyback & burn: what the
  -- copyfomo creator wallets pay (COIN or USDG) in a transaction where they receive $COPY from
  -- the pool and burn $COPY in the same transaction (see https://www.copyfomo.com/data).
  tok_px AS (
    SELECT timestamp AS hour, price FROM prices.hour
    WHERE blockchain = 'robinhood' AND contract_address = ${COIN_ROBINHOOD} AND PRICE_RANGE
  ),
  tok_px_day AS (
    SELECT cast(timestamp AS date) AS day, price FROM prices.day
    WHERE blockchain = 'robinhood' AND contract_address = ${COIN_ROBINHOOD} AND PRICE_RANGE
  ),
  tok_mv AS (
    SELECT t.block_time, t.evt_tx_hash AS tx_hash, t.contract_address AS token, t."from", t."to",
      CAST(t.value AS DOUBLE) AS value,
      COALESCE(p.price, d.price) AS coin_price
    FROM (SELECT evt_block_time AS block_time, * FROM erc20_robinhood.evt_Transfer) t
    LEFT JOIN tok_px p ON p.hour = date_trunc('hour', t.block_time)
    LEFT JOIN tok_px_day d ON d.day = cast(t.block_time AS date)
    WHERE TIME_RANGE
      AND t.contract_address IN (${COIN_ROBINHOOD}, ${USDG_ROBINHOOD}, ${COPY_TOKEN})
      AND (t."from" IN (${CREATOR_WALLETS}) OR t."to" IN (${CREATOR_WALLETS}))
  ),
  tok_swaps AS (
    SELECT tx_hash, block_time, abs(cast(varbinary_to_int256(varbinary_substring(data, 1, 32)) AS double)) / 1e18 AS coin
    FROM robinhood.logs
    WHERE PARTITION_RANGE AND TIME_RANGE
      AND contract_address = ${UNIV4_POOL_MANAGER_ROBINHOOD}
      AND topic0 = ${UNIV4_SWAP_TOPIC}
      AND topic1 = ${COPY_POOL_ID}
  ),
  tok_creator AS (
    SELECT SUM(s.coin * COALESCE(p.price, d.price)) * ${COPY_CREATOR_FEE_RATE} AS creator_usd
    FROM tok_swaps s
    LEFT JOIN tok_px p ON p.hour = date_trunc('hour', s.block_time)
    LEFT JOIN tok_px_day d ON d.day = cast(s.block_time AS date)
  ),
  -- a buyback = one transaction that (1) swapped on the COPY/COIN pool, (2) delivered $COPY to a
  -- creator wallet and (3) burned $COPY from that wallet. The buyback account buys and burns in
  -- the same ERC-4337 user operation, so a buy without a burn in the same transaction (an OTC or
  -- airdropped receipt, a buy kept in the wallet) is not a buyback, except the three listed manual
  -- buys whose burn came the next day (see MANUAL_BUYBACKS_BURNED_LATER).
  tok_burn_tx AS (
    SELECT DISTINCT tx_hash FROM tok_mv
    WHERE token = ${COPY_TOKEN} AND "from" IN (${CREATOR_WALLETS}) AND "to" IN (${BURN_ADDRS})
    UNION ALL
    SELECT tx_hash FROM tok_mv WHERE tx_hash IN (${MANUAL_BUYBACK_TXS})
  ),
  tok_buys AS (
    SELECT DISTINCT m.tx_hash
    FROM tok_mv m
    JOIN tok_swaps s ON s.tx_hash = m.tx_hash
    JOIN tok_burn_tx b ON b.tx_hash = m.tx_hash
    WHERE m.token = ${COPY_TOKEN} AND m."to" IN (${CREATOR_WALLETS})
      AND m."from" NOT IN (${CREATOR_WALLETS}, ${PONS_FEE_ESCROW})
      AND m.block_time >= TIMESTAMP '${BUYBACK_SINCE}'
  ),
  tok_bb AS (
    SELECT SUM(CASE WHEN m.token = ${USDG_ROBINHOOD} THEN m.value / 1e6 ELSE m.value / 1e18 * m.coin_price END) AS buyback_usd
    FROM tok_mv m JOIN tok_buys b ON b.tx_hash = m.tx_hash
    WHERE m.token IN (${COIN_ROBINHOOD}, ${USDG_ROBINHOOD}) AND m."from" IN (${CREATOR_WALLETS}) AND m."to" NOT IN (${CREATOR_WALLETS})
  ),
  tok AS (
    SELECT 'robinhood' AS chain, c.creator_usd, b.buyback_usd FROM tok_creator c CROSS JOIN tok_bb b
  )
SELECT f.chain, COALESCE(f.fees_usd, 0) AS fees_usd, COALESCE(r.referral_usd, 0) AS referral_usd, COALESCE(g.gas_usd, 0) AS gas_usd,
  COALESCE(k.creator_usd, 0) AS creator_usd, COALESCE(k.buyback_usd, 0) AS buyback_usd
FROM fees f LEFT JOIN referral r ON r.chain = f.chain LEFT JOIN gas g ON g.chain = f.chain LEFT JOIN tok k ON k.chain = f.chain
`;

/**
 * Volume: the stablecoin leg of every trade executed by a copyfomo wallet.
 * A transaction is classified per wallet from its token movements only (no DEX
 * decoding, so pump.fun / new pools are covered):
 *   buy  = stablecoin leaves the wallet AND a non-stable token enters it -> stablecoin amount
 *   sell = a non-stable token leaves the wallet AND stablecoin enters it   -> stablecoin amount
 * Deposits, withdrawals and cash moves between a user's own wallets move a stablecoin
 * without any token leg, so they are excluded by construction. Fee transfers to the
 * treasury are excluded explicitly. Cross-chain intents (stablecoin on chain A, token on
 * chain B, executed by a solver) are NOT counted -- see methodology.
 */
export const VOLUME_SQL = `
WITH ${EVM_WALLETS_CTE},
  -- two equality joins (sender side, receiver side): an OR join defeats the hash join and
  -- turns this into a nested loop over every transfer of the day
  evm_mv AS (
    SELECT t.blockchain, t.tx_hash, w.wallet,
      t.contract_address IN (${STABLES_BASE_BNB}) AS is_stable,
      TRUE AS is_out,
      t."to" IN (${TRES_EVM}) AS to_treasury,
      t.amount_usd
    FROM tokens.transfers t
    JOIN evm_wallets w ON w.blockchain = t.blockchain AND w.wallet = t."from"
    WHERE PARTITION_RANGE AND TIME_RANGE
      AND t.blockchain IN ('base', 'bnb')
      AND t.token_standard IN ('erc20', 'bep20')
    UNION ALL
    SELECT t.blockchain, t.tx_hash, w.wallet,
      t.contract_address IN (${STABLES_BASE_BNB}) AS is_stable,
      FALSE AS is_out,
      FALSE AS to_treasury,
      t.amount_usd
    FROM tokens.transfers t
    JOIN evm_wallets w ON w.blockchain = t.blockchain AND w.wallet = t."to"
    WHERE PARTITION_RANGE AND TIME_RANGE
      AND t.blockchain IN ('base', 'bnb')
      AND t.token_standard IN ('erc20', 'bep20')
      AND t."from" <> t."to"
  ),
  rh_mv AS (
    SELECT 'robinhood' AS blockchain, t.evt_tx_hash AS tx_hash, w.wallet,
      t.contract_address = ${USDG_ROBINHOOD} AS is_stable,
      TRUE AS is_out,
      t."to" IN (${TRES_EVM}) AS to_treasury,
      CASE WHEN t.contract_address = ${USDG_ROBINHOOD} THEN t.value / 1e6 ELSE 0 END AS amount_usd
    FROM (SELECT evt_block_time AS block_time, * FROM erc20_robinhood.evt_Transfer) t
    JOIN rh_wallets w ON w.wallet = t."from"
    WHERE TIME_RANGE
    UNION ALL
    SELECT 'robinhood', t.evt_tx_hash, w.wallet,
      t.contract_address = ${USDG_ROBINHOOD},
      FALSE, FALSE,
      CASE WHEN t.contract_address = ${USDG_ROBINHOOD} THEN t.value / 1e6 ELSE 0 END
    FROM (SELECT evt_block_time AS block_time, * FROM erc20_robinhood.evt_Transfer) t
    JOIN rh_wallets w ON w.wallet = t."to"
    WHERE TIME_RANGE AND t."from" <> t."to"
  ),
  evm_per AS (
    SELECT blockchain, tx_hash, wallet,
      SUM(CASE WHEN is_stable AND is_out AND NOT to_treasury THEN amount_usd ELSE 0 END) AS stable_out,
      SUM(CASE WHEN is_stable AND NOT is_out THEN amount_usd ELSE 0 END) AS stable_in,
      SUM(CASE WHEN NOT is_stable AND NOT is_out THEN 1 ELSE 0 END) AS token_in,
      SUM(CASE WHEN NOT is_stable AND is_out THEN 1 ELSE 0 END) AS token_out
    FROM (SELECT * FROM evm_mv UNION ALL SELECT * FROM rh_mv)
    GROUP BY 1, 2, 3
  ),
  sol_tx AS (
    SELECT id, account_keys[2] AS wallet
    FROM solana.transactions
    WHERE PARTITION_RANGE AND TIME_RANGE
      AND signer = '${FEE_PAYER_SOL}'
      AND success
      AND cardinality(signatures) = 2
  ),
  sol_mv AS (
    SELECT o.id AS tx_hash, o.wallet,
      t.token_mint_address IN (${strList(STABLES_SOL)}) AS is_stable,
      t.token_mint_address = '${WSOL}' AS is_sol,
      t.from_owner = o.wallet AS is_out,
      t.to_owner = o.wallet AS is_in,
      t.amount_usd
    FROM tokens_solana.transfers t
    JOIN sol_tx o ON o.id = t.tx_id
    WHERE PARTITION_RANGE AND TIME_RANGE
      AND t.to_owner <> '${TREASURY_SOL}'
  ),
  sol_per AS (
    SELECT 'solana' AS blockchain, tx_hash, wallet,
      SUM(CASE WHEN is_stable AND is_out THEN amount_usd ELSE 0 END) AS stable_out,
      SUM(CASE WHEN is_stable AND is_in THEN amount_usd ELSE 0 END) AS stable_in,
      SUM(CASE WHEN NOT is_stable AND NOT is_sol AND is_in THEN 1 ELSE 0 END) AS token_in,
      SUM(CASE WHEN NOT is_stable AND NOT is_sol AND is_out THEN 1 ELSE 0 END) AS token_out
    FROM sol_mv
    WHERE is_out OR is_in
    GROUP BY 1, 2, 3
  ),
  legs AS (
    SELECT blockchain, stable_out, stable_in, token_in, token_out FROM evm_per
    UNION ALL
    SELECT blockchain, stable_out, stable_in, token_in, token_out FROM sol_per
  )
SELECT blockchain AS chain,
  SUM(CASE WHEN stable_out > 0 AND token_in > 0 THEN stable_out
           WHEN stable_in > 0 AND token_out > 0 THEN stable_in
           ELSE 0 END) AS volume_usd
FROM legs
GROUP BY 1
`;
