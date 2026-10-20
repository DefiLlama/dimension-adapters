// Sapling, the first fully zcash-native launchpad: https://sapling.cash
//
// Every Sapling coin is created with its creator set to a Sapling program address, so the 2% creator fee on every
// buy and sell of the coin is collected by Sapling and split on chain by the Sapling vault program's `settle`
// instruction. Each settle emits an Anchor event with the exact amount sent to each destination, and this adapter
// reads those events. Fees are counted when they are settled (the fee is collected and split every few minutes).
//
// Programs:
//   Sapling vault  A9zFnNZpVjBbcE1SAPY92Z6H7WhicysLNPYPpDz15UxF  (the 2% fee split)
//   Sapling guard  GzMQc5VQGggFnicdAKc7MmkQV3dn3i12ux9dbLKqzy6F  (Zcash accounts: trades paid from a Zcash wallet)
//
// The split in force is read from the vault's Config account 8z2Rv1dKQgA5pqT8kiNmkAmAUDRVHwXhuxrhEoa6QyRy:
//   10% treasury, 25% $SAPLING/ZEC liquidity (LP burned), 25% $SAPLING buyback and burn, 40% the coin's deployer
//   (paid to the deployer, a wallet they name, or the coin's holders as holder rewards).
// The liquidity share is holders revenue: the LP wallet buys about half of it in $SAPLING on the PumpSwap
// $SAPLING/ZEC pool, deposits both sides and burns the LP tokens, so nobody, Sapling included, can withdraw it
// (https://sapling.cash/docs).
// The events carry the amounts actually sent, so a change of split needs no change here.
//
// The deployer's 40% is supply side whoever receives it: holder rewards go to the holders of the launched coin, not
// to $SAPLING holders. They are counted when settled; the rewards wallet (vault Config rewards_wallet
// 37BBnMe6rTeH3Cxs1meobB6C564GJ7Gxj7SinQfgHPrL) pays them out to the holders later.
//
// Events read (Anchor "Program data" logs, read from the transactions' log messages on Allium with the program that
// wrote each line, see helpers/alliumSolanaEvents.ts):
//   Settled           mint, amount, to_treasury, to_vault, to_overflow, buyback_sapling, to_deployer, holders, ...
//   ToLiquidity       mint, amount, source (0 = from a settle), pot_after
//   SaplingSettled    coins paired with $SAPLING: mint, amount, burned, to_lp, to_convert, pending_after
//   SaplingConverted  the converted half of a $SAPLING paired coin's fee: ..., to_deployer, to_treasury
// and of the guard program:
//   OrderRan          a Zcash account's buy, planting or sale: ..., fee_zec (network costs, not a fee), sapling_fee
//
// Before 2026-10-02 the 25% liquidity share was held in a vault per coin (to_vault, to_overflow); those vaults were
// then moved into the same $SAPLING/ZEC liquidity. From 2026-10-02 the share goes there directly (ToLiquidity).

import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { METRIC } from "../../helpers/metrics";
import { assertComplete, programEventsSql, timeFilter, u64, u8 } from "../../helpers/alliumSolanaEvents";

const VAULT_PROGRAM = "A9zFnNZpVjBbcE1SAPY92Z6H7WhicysLNPYPpDz15UxF";
const GUARD_PROGRAM = "GzMQc5VQGggFnicdAKc7MmkQV3dn3i12ux9dbLKqzy6F";
const ZEC = "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS"; // ZEC (bridged mint), 8 decimals: the quote of Sapling coins
const SAPLING = "BZFYNPeQAEW3HWQ4DNsTVahC1n4ZjTgn6jB2nnBbB96W"; // $SAPLING, 6 decimals
const SOL = ADDRESSES.solana.SOL; // the planting fee is paid in lamports
const TREASURY = "FauKh2enCxjqMDaEEmo3qMmA9toxyZPFvPhGEZNMzChr"; // vault Config treasury
// Planting fee: a flat SOL transfer to the treasury (0.01 SOL in October 2026) in the transaction that creates the
// coin on pump.fun
const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const PUMP_CREATES = ["181ec828051c0777", "d6904cec5f8b31b4"]; // pump.fun create, create_v2: sha256("global:<name>")[0..8]

// Anchor event discriminators, sha256("event:<Name>")[0..8], and payload sizes in bytes
const EVENT = {
  Settled: { discriminator: "E8D228118E7C91EE", size: 105 },
  ToLiquidity: { discriminator: "09D116A19D22617E", size: 57 },
  SaplingSettled: { discriminator: "8C09C6B99F8AA542", size: 80 },
  SaplingConverted: { discriminator: "AFC36889823E28C0", size: 96 },
  OrderRan: { discriminator: "ACEE3CC1D2DF2B50", size: 137 },
};

const LABELS = {
  COIN_FEES: "Coin Trading Fees",
  ACCOUNT_FEES: "Zcash Account Fees",
  PLANTING_FEES: "Coin Planting Fees",
  PLANTING_TO_TREASURY: "Coin Planting Fees To Treasury",
  TO_TREASURY: "Coin Trading Fees To Treasury",
  ACCOUNT_TO_TREASURY: "Zcash Account Fees To Treasury",
  BUYBACK: METRIC.TOKEN_BUY_BACK, // "Token Buy Back": $SAPLING bought and burned
  LIQUIDITY: "$SAPLING/ZEC Liquidity",
  TO_DEPLOYERS: "Coin Trading Fees To Deployers",
  TO_COIN_HOLDERS: "Coin Trading Fees To Coin Holders",
};

const events = (program: string, event: { discriminator: string; size: number }) =>
  `FROM program_events WHERE program = '${program}' AND STARTSWITH(data, '${event.discriminator}') AND LENGTH(data) = ${2 * event.size}`;

const fetch = async (options: FetchOptions) => {
  const [row] = await queryAllium(`${programEventsSql([VAULT_PROGRAM, GUARD_PROGRAM], options)},
  settled AS (
    -- Settled: to_treasury u64 @48 | to_vault u64 @56 | to_overflow u64 @64 | buyback_sapling u64 @72 | to_deployer u64 @80 | holders u8 @88
    SELECT ${u64("data", 48)} AS to_treasury, ${u64("data", 56)} + ${u64("data", 64)} AS to_liquidity,
      ${u64("data", 72)} AS to_buyback, ${u64("data", 80)} AS to_deployer, ${u8("data", 88)} = '01' AS to_holders
    ${events(VAULT_PROGRAM, EVENT.Settled)}
  ),
  sapling_settled AS (
    -- SaplingSettled: burned u64 @48 | to_lp u64 @56 (both in $SAPLING)
    SELECT ${u64("data", 48)} AS burned, ${u64("data", 56)} AS to_lp
    ${events(VAULT_PROGRAM, EVENT.SaplingSettled)}
  ),
  sapling_converted AS (
    -- SaplingConverted: to_deployer u64 @80 | to_treasury u64 @88
    SELECT ${u64("data", 80)} AS to_deployer, ${u64("data", 88)} AS to_treasury
    ${events(VAULT_PROGRAM, EVENT.SaplingConverted)}
  ),
  planting_txs AS (
    SELECT txn_id FROM solana.raw.instructions
    WHERE ${timeFilter(options)} AND program_id = '${PUMP_PROGRAM}' AND data_hex_first16 IN (${PUMP_CREATES.map((d) => `'${d}'`).join(", ")})
    UNION ALL
    SELECT txn_id FROM solana.raw.inner_instructions
    WHERE ${timeFilter(options)} AND program_id = '${PUMP_PROGRAM}' AND data_hex_first16 IN (${PUMP_CREATES.map((d) => `'${d}'`).join(", ")})
  )
  SELECT checks.*,
    -- a known event with an unexpected size: its layout changed and the offsets below no longer hold
    (SELECT COUNT(*) FROM program_events WHERE ${Object.values(EVENT).map((e) => `(STARTSWITH(data, '${e.discriminator}') AND LENGTH(data) != ${2 * e.size})`).join(" OR ")}) AS unknown_layouts,
    (SELECT SUM(to_treasury) FROM settled)::VARCHAR AS settled_treasury,
    (SELECT SUM(to_liquidity) FROM settled)::VARCHAR AS settled_liquidity,
    (SELECT SUM(to_buyback) FROM settled)::VARCHAR AS settled_buyback,
    (SELECT SUM(IFF(to_holders, 0, to_deployer)) FROM settled)::VARCHAR AS settled_deployers,
    (SELECT SUM(IFF(to_holders, to_deployer, 0)) FROM settled)::VARCHAR AS settled_coin_holders,
    -- ToLiquidity: amount u64 @40 | source u8 @48 (0 = the share of a settle; other sources move funds already counted)
    (SELECT SUM(${u64("data", 40)}) ${events(VAULT_PROGRAM, EVENT.ToLiquidity)} AND ${u8("data", 48)} = '00')::VARCHAR AS to_liquidity,
    (SELECT SUM(burned) FROM sapling_settled)::VARCHAR AS sapling_burned,
    (SELECT SUM(to_lp) FROM sapling_settled)::VARCHAR AS sapling_to_lp,
    (SELECT SUM(to_deployer) FROM sapling_converted)::VARCHAR AS converted_deployers,
    (SELECT SUM(to_treasury) FROM sapling_converted)::VARCHAR AS converted_treasury,
    -- OrderRan: sapling_fee u64 @121
    (SELECT SUM(${u64("data", 121)}) ${events(GUARD_PROGRAM, EVENT.OrderRan)})::VARCHAR AS account_fees,
    (SELECT SUM(raw_amount) FROM solana.assets.transfers
      WHERE ${timeFilter(options)} AND transfer_type = 'sol_transfer' AND type = 'transfer' AND to_address = '${TREASURY}'
        AND txn_id IN (SELECT txn_id FROM planting_txs))::VARCHAR AS planting_fees
  FROM checks`);
  assertComplete(row, "sapling", options);
  if (Number(row.unknown_layouts) > 0)
    throw new Error(`sapling: ${row.unknown_layouts} Sapling events with an unexpected size, their layout changed`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // [token, amount, fee source label, destination label, metric the destination belongs to]
  const parts: [string, string | undefined, string, string, "protocol" | "holders" | "supply"][] = [
    [ZEC, row.settled_treasury, LABELS.COIN_FEES, LABELS.TO_TREASURY, "protocol"],
    [ZEC, row.converted_treasury, LABELS.COIN_FEES, LABELS.TO_TREASURY, "protocol"],
    [ZEC, row.settled_buyback, LABELS.COIN_FEES, LABELS.BUYBACK, "holders"],
    [SAPLING, row.sapling_burned, LABELS.COIN_FEES, LABELS.BUYBACK, "holders"],
    [ZEC, row.settled_liquidity, LABELS.COIN_FEES, LABELS.LIQUIDITY, "holders"],
    [ZEC, row.to_liquidity, LABELS.COIN_FEES, LABELS.LIQUIDITY, "holders"],
    [SAPLING, row.sapling_to_lp, LABELS.COIN_FEES, LABELS.LIQUIDITY, "holders"],
    [ZEC, row.settled_deployers, LABELS.COIN_FEES, LABELS.TO_DEPLOYERS, "supply"],
    [ZEC, row.converted_deployers, LABELS.COIN_FEES, LABELS.TO_DEPLOYERS, "supply"],
    [ZEC, row.settled_coin_holders, LABELS.COIN_FEES, LABELS.TO_COIN_HOLDERS, "supply"],
    [ZEC, row.account_fees, LABELS.ACCOUNT_FEES, LABELS.ACCOUNT_TO_TREASURY, "protocol"],
    [SOL, row.planting_fees, LABELS.PLANTING_FEES, LABELS.PLANTING_TO_TREASURY, "protocol"],
  ];
  // a sum over no rows is absent from the response: nothing of that kind happened in an indexed window
  for (const [token, amount, source, destination, metric] of parts) {
    dailyFees.add(token, amount ?? 0, source);
    if (metric === "supply") {
      dailySupplySideRevenue.add(token, amount ?? 0, destination);
    } else {
      dailyRevenue.add(token, amount ?? 0, destination);
      (metric === "protocol" ? dailyProtocolRevenue : dailyHoldersRevenue).add(token, amount ?? 0, destination);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "The 2% fee on every buy and sell of a coin launched on Sapling, the flat fee paid to plant a coin, and Sapling's fee on buys, plantings and sales made from a Zcash account.",
  Revenue: "The part of the 2% coin trading fee Sapling keeps (10% treasury, 25% $SAPLING buyback and burn, 25% $SAPLING/ZEC liquidity), plus the planting fee and the Zcash account fee.",
  ProtocolRevenue: "The treasury's share: 10% of the 2% coin trading fee, plus the planting fee and the Zcash account fee.",
  HoldersRevenue: "50% of the 2% coin trading fee: 25% buys and burns $SAPLING, and 25% goes to the $SAPLING/ZEC pool on PumpSwap, where about half of it buys $SAPLING, both sides are deposited and the LP tokens are burned, so no one, Sapling included, can withdraw it.",
  SupplySideRevenue: "40% of the 2% coin trading fee, paid to each coin's deployer, a wallet they choose, or the holders of that coin as holder rewards.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.COIN_FEES]: "The 2% fee on every buy and sell of a coin launched on Sapling, collected and split on chain by the Sapling vault program.",
    [LABELS.ACCOUNT_FEES]: "Sapling's fee on a buy, planting or sale made from a Zcash account.",
    [LABELS.PLANTING_FEES]: "The flat fee paid to the Sapling treasury when a coin is planted, in the same transaction that creates the coin.",
  },
  Revenue: {
    [LABELS.TO_TREASURY]: "10% of the 2% coin trading fee, sent to the Sapling treasury.",
    [LABELS.PLANTING_TO_TREASURY]: "The flat planting fee, sent to the Sapling treasury.",
    [LABELS.ACCOUNT_TO_TREASURY]: "The Zcash account fee, sent to the Sapling treasury.",
    [LABELS.BUYBACK]: "25% of the 2% coin trading fee, used to buy $SAPLING and burn it (burned directly for coins paired with $SAPLING).",
    [LABELS.LIQUIDITY]: "25% of the 2% coin trading fee, added to the $SAPLING/ZEC pool on PumpSwap: about half of it buys $SAPLING, both sides are deposited and the LP tokens are burned, so no one, Sapling included, can withdraw it (held in a vault per coin before 2026-10-02, then moved into the same liquidity).",
  },
  ProtocolRevenue: {
    [LABELS.TO_TREASURY]: "10% of the 2% coin trading fee, sent to the Sapling treasury.",
    [LABELS.PLANTING_TO_TREASURY]: "The flat planting fee, sent to the Sapling treasury.",
    [LABELS.ACCOUNT_TO_TREASURY]: "The Zcash account fee, sent to the Sapling treasury.",
  },
  HoldersRevenue: {
    [LABELS.BUYBACK]: "25% of the 2% coin trading fee, used to buy $SAPLING and burn it (burned directly for coins paired with $SAPLING).",
    [LABELS.LIQUIDITY]: "25% of the 2% coin trading fee, added to the $SAPLING/ZEC pool on PumpSwap: about half of it buys $SAPLING, both sides are deposited and the LP tokens are burned, so no one, Sapling included, can withdraw it (held in a vault per coin before 2026-10-02, then moved into the same liquidity).",
  },
  SupplySideRevenue: {
    [LABELS.TO_DEPLOYERS]: "40% of the 2% coin trading fee, paid to the coin's deployer or a wallet they choose.",
    [LABELS.TO_COIN_HOLDERS]: "40% of the 2% coin trading fee of coins whose deployer chose holder rewards, paid in ZEC to the holders of that coin.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-25",
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
