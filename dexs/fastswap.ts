import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";

// FastSwap (https://fastswap.io) is a trading app. A user keeps one USDC balance on Solana and
// buys or sells coins from it. FastSwap runs no pools: every swap on Solana goes through Jupiter,
// so this volume is already inside Jupiter and the DEXs behind it -> doublecounted.
//
// How a FastSwap swap is found on chain
// - One public wallet (SPONSOR) is the fee payer of its users' transactions, so users need no
//   SOL. (The user pays the network cost back in USDC in the same transaction. That transfer is
//   not a trade and is not counted.)
// - The user's wallet signs the same transaction, so it has at least two signers. The sponsor
//   wallet also swaps USDC back into SOL for itself now and then. Those transactions have one
//   signer and are left out.
// - Only transactions with DEX trade rows are counted. The sponsor wallet is also the fee payer
//   of its users' withdrawals and Relay deposits, which have none.
// The sponsor pays for one user swap per transaction, so rows are grouped by tx_id alone.
// trader_id is not used: in a sponsored transaction it is the fee payer for some DEXs and the
// user for others, so one swap can carry two trader ids.
//
// How a swap is valued
// dex_solana.trades has one row per pool hop. Every FastSwap swap starts or ends in USDC, so per
// transaction we add up the hops that sell USDC (a buy) and the hops that buy USDC (a sale) and
// take the larger of the two sums. That is one value per swap: a route with several hops is not
// counted several times, and a route that splits the USDC over several pools is counted in full.
//
// What is left out on purpose
// - USDT deposits. A user who deposits USDT has it swapped into USDC automatically. That is a
//   deposit being converted, not a trade. On chain it is a transaction that sells USDT and never
//   buys it, and it is dropped.
// - Trades on other chains. FastSwap sends them through Relay. On Solana a buy on another chain
//   is a USDC deposit into the Relay depository, and a withdrawal to another chain is the same
//   instruction with the same accounts. A sale on another chain comes back as USDC from a Relay
//   solver, the same way a deposit from another chain does. Counting those legs would put
//   withdrawals and deposits into volume, so they stay out and the figure is a lower bound.

// FastSwap's sponsor wallet. It is the fee payer (first signer) of the trades it sponsors, and
// the user pays the network cost back in USDC in the same transaction.
// https://solscan.io/account/BfqNGQKywcncTntV56gxS2midJmGmQLRwyqxNrQwLXEG
const SPONSOR = "BfqNGQKywcncTntV56gxS2midJmGmQLRwyqxNrQwLXEG";
// USDC on Solana, the coin every FastSwap balance is held in.
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
// USDT on Solana, used only to drop the conversion of a USDT deposit into USDC.
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

const fetch = async (options: FetchOptions) => {
  // Dune needs some hours to finish a Solana day, and an unfinished day reads low without an error.
  assertDuneSolanaIndexed(options);

  const rows = await queryDuneSql(options, `
    WITH sponsored AS (
      SELECT id AS tx_id
      FROM solana.transactions
      WHERE TIME_RANGE
        AND success
        AND signer = '${SPONSOR}'
        AND cardinality(signers) >= 2
    ),
    per_tx AS (
      SELECT
        t.tx_id,
        SUM(CASE WHEN t.token_sold_mint_address = '${USDC}' THEN COALESCE(t.amount_usd, 0) ELSE 0 END) AS usdc_in,
        SUM(CASE WHEN t.token_bought_mint_address = '${USDC}' THEN COALESCE(t.amount_usd, 0) ELSE 0 END) AS usdc_out,
        COALESCE(BOOL_OR(t.token_sold_mint_address = '${USDT}'), false) AS sells_usdt,
        COALESCE(BOOL_OR(t.token_bought_mint_address = '${USDT}'), false) AS buys_usdt
      FROM dex_solana.trades t
      JOIN sponsored s ON s.tx_id = t.tx_id
      WHERE TIME_RANGE
      GROUP BY t.tx_id
    )
    SELECT
      COALESCE(SUM(GREATEST(usdc_in, usdc_out)), 0) AS daily_volume,
      COUNT(*) AS swaps
    FROM per_tx
    WHERE NOT (sells_usdt AND NOT buys_usdt)
  `);

  // The query always answers one row, with 0 on a day without swaps. No row or no number means
  // Dune did not answer properly, and reporting 0 then would be wrong.
  const volume = rows?.[0]?.daily_volume;
  if (volume === null || volume === undefined || !Number.isFinite(Number(volume))) {
    throw new Error(`No FastSwap volume row from Dune for ${options.dateString}`);
  }

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(Number(volume));
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  // Public launch. Earlier transactions of the sponsor wallet are the team's own tests.
  start: "2026-10-11",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true,
  methodology: {
    Volume: "USD value of swaps on Solana made through FastSwap, measured at the USDC side of each swap and counted once per transaction. FastSwap routes every Solana swap through Jupiter, so this volume is also part of Jupiter and of the DEXs behind it. Trades on other chains, which FastSwap sends through Relay, are not included, so this is a lower bound.",
  },
};

export default adapter;
