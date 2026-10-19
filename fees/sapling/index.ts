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
// The events carry the amounts actually sent, so a change of split needs no change here.
//
// Events read (Anchor "Program data" logs of the vault program, decoded by byte offset):
//   Settled           mint, amount, to_treasury, to_vault, to_overflow, buyback_sapling, to_deployer, holders, ...
//   ToLiquidity       mint, amount, source (0 = from a settle), pot_after
//   SaplingSettled    coins paired with $SAPLING: mint, amount, burned, to_lp, to_convert, pending_after
//   SaplingConverted  the converted half of a $SAPLING paired coin's fee: ..., to_deployer, to_treasury
// and of the guard program:
//   OrderRan          a Zcash account's buy, planting or sale: ..., fee_zec (network costs, not a fee), sapling_fee
//
// Before 2026-10-02 the 25% liquidity share was held in a vault per coin (to_vault, to_overflow); those vaults were
// then moved into the same $SAPLING/ZEC liquidity. From 2026-10-02 the share goes there directly (ToLiquidity).
//
// Each event is valued at its own minute (prices.minute). An event without a minute price is passed as a token
// amount and priced by DefiLlama.

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const VAULT_PROGRAM = "A9zFnNZpVjBbcE1SAPY92Z6H7WhicysLNPYPpDz15UxF";
const GUARD_PROGRAM = "GzMQc5VQGggFnicdAKc7MmkQV3dn3i12ux9dbLKqzy6F";
const ZEC = "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS"; // ZEC (bridged mint), 8 decimals: the quote of Sapling coins
const SAPLING = "BZFYNPeQAEW3HWQ4DNsTVahC1n4ZjTgn6jB2nnBbB96W"; // $SAPLING, 6 decimals
// Holder rewards: the vault releases a coin's pot to the rewards wallet (vault Config rewards_wallet
// 37BBnMe6rTeH3Cxs1meobB6C564GJ7Gxj7SinQfgHPrL), which pays each holder in plain ZEC transfers from its ZEC account,
// then returns what is left to the pot inside a vault instruction (not counted). Opening a holder's ZEC account is
// repaid in ZEC to the treasury in the same transaction (not counted).
const REWARDS_ZEC_ACCOUNT = "DEpWQpqcuDv1QDp6X3nGjukmGBh2kts4NEhxQHXR3Feh"; // ZEC account of the rewards wallet
const TREASURY = "FauKh2enCxjqMDaEEmo3qMmA9toxyZPFvPhGEZNMzChr"; // vault Config treasury
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// Anchor event discriminators: sha256("event:<Name>")[0..8]
const SETTLED = "0xe8d228118e7c91ee";
const TO_LIQUIDITY = "0x09d116a19d22617e";
const SAPLING_SETTLED = "0x8c09c6b99f8aa542";
const SAPLING_CONVERTED = "0xafc36889823e28c0";
const ORDER_RAN = "0xacee3cc1d2df2b50";

const LABELS = {
  COIN_FEES: "Coin Trading Fees",
  ACCOUNT_FEES: "Zcash Account Fees",
  TO_TREASURY: "Coin Trading Fees To Treasury",
  ACCOUNT_TO_TREASURY: "Zcash Account Fees To Treasury",
  BUYBACK: METRIC.TOKEN_BUY_BACK, // "Token Buy Back": $SAPLING bought and burned
  LIQUIDITY: "$SAPLING/ZEC Liquidity",
  TO_DEPLOYERS: "Coin Trading Fees To Deployers",
  TO_COIN_HOLDERS: "Coin Trading Fees To Coin Holders",
  HOLDER_REWARDS: "Holder Rewards Paid In ZEC",
};

// part -> [fee source label, destination label, metric the destination belongs to]
const PARTS: Record<string, [string | null, string, "supply" | "protocol" | "holders" | "revenue" | "paid"]> = {
  treasury: [LABELS.COIN_FEES, LABELS.TO_TREASURY, "protocol"],
  buyback: [LABELS.COIN_FEES, LABELS.BUYBACK, "holders"],
  liquidity: [LABELS.COIN_FEES, LABELS.LIQUIDITY, "holders"],
  deployers: [LABELS.COIN_FEES, LABELS.TO_DEPLOYERS, "supply"],
  coin_holders: [LABELS.COIN_FEES, LABELS.TO_COIN_HOLDERS, "revenue"],
  holder_rewards: [null, LABELS.HOLDER_REWARDS, "paid"],
  account_fee: [LABELS.ACCOUNT_FEES, LABELS.ACCOUNT_TO_TREASURY, "protocol"],
};

// little endian u64 at a 1-based byte offset of the event data
const u64 = (offset: number) => `CAST(varbinary_to_uint256(reverse(varbinary_substring(data, ${offset}, 8))) AS DOUBLE)`;

const fetch = async (options: FetchOptions) => {
  // Dune partitions solana tables by block_date and clusters instruction_calls by executing_account_prefix
  const dayPartition = `block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE) AND block_date <= CAST(from_unixtime(${options.endTimestamp}) AS DATE)`;
  const rows = await queryDuneSql(options, `
    WITH events AS (
      SELECT DISTINCT
        i.block_time,
        i.tx_id,
        i.executing_account AS program,
        from_base64(substr(log_message, 15)) AS data
      FROM solana.instruction_calls i
      CROSS JOIN UNNEST(i.log_messages) AS logs(log_message)
      WHERE i.executing_account IN ('${VAULT_PROGRAM}', '${GUARD_PROGRAM}')
        AND i.executing_account_prefix IN ('${VAULT_PROGRAM.slice(0, 2)}', '${GUARD_PROGRAM.slice(0, 2)}')
        AND i.tx_success = TRUE
        AND i.${dayPartition}
        AND TIME_RANGE
        AND starts_with(log_message, 'Program data: ')
    ),
    parts AS (
      -- the 2% creator fee, settled in ZEC (coins quoted in other assets are converted to ZEC before the settle)
      SELECT block_time, part, '${ZEC}' AS token, amount FROM (
        SELECT block_time, data FROM events
        WHERE program = '${VAULT_PROGRAM}' AND varbinary_substring(data, 1, 8) = ${SETTLED} AND length(data) = 105
      ) s
      CROSS JOIN UNNEST(
        ARRAY['treasury', 'liquidity', 'buyback', IF(varbinary_substring(s.data, 89, 1) = 0x01, 'coin_holders', 'deployers')],
        ARRAY[${u64(49)}, ${u64(57)} + ${u64(65)}, ${u64(73)}, ${u64(81)}]
      ) AS p(part, amount)
      UNION ALL
      -- the liquidity share of a settle since 2026-10-02 (source 0; other sources are not fees)
      SELECT block_time, 'liquidity', '${ZEC}', ${u64(41)}
      FROM events
      WHERE program = '${VAULT_PROGRAM}' AND varbinary_substring(data, 1, 8) = ${TO_LIQUIDITY} AND length(data) = 57
        AND varbinary_substring(data, 49, 1) = 0x00
      UNION ALL
      -- coins paired with $SAPLING: 25% burned and 25% to liquidity in $SAPLING at the settle ...
      SELECT block_time, part, '${SAPLING}', amount FROM (
        SELECT block_time, data FROM events
        WHERE program = '${VAULT_PROGRAM}' AND varbinary_substring(data, 1, 8) = ${SAPLING_SETTLED} AND length(data) = 80
      ) s
      CROSS JOIN UNNEST(ARRAY['buyback', 'liquidity'], ARRAY[${u64(49)}, ${u64(57)}]) AS p(part, amount)
      UNION ALL
      -- ... and the other half converted to ZEC, then paid to the deployer and the treasury
      SELECT block_time, part, '${ZEC}', amount FROM (
        SELECT block_time, data FROM events
        WHERE program = '${VAULT_PROGRAM}' AND varbinary_substring(data, 1, 8) = ${SAPLING_CONVERTED} AND length(data) = 96
      ) s
      CROSS JOIN UNNEST(ARRAY['deployers', 'treasury'], ARRAY[${u64(81)}, ${u64(89)}]) AS p(part, amount)
      UNION ALL
      -- Sapling's fee on a Zcash account's buy, planting or sale, paid to the treasury
      SELECT block_time, 'account_fee', '${ZEC}', ${u64(122)}
      FROM events
      WHERE program = '${GUARD_PROGRAM}' AND varbinary_substring(data, 1, 8) = ${ORDER_RAN} AND length(data) = 137
      UNION ALL
      -- holder rewards paid: plain ZEC transfers out of the rewards wallet's ZEC account to holders
      SELECT block_time, 'holder_rewards', '${ZEC}', CAST(amount AS DOUBLE)
      FROM tokens_solana.transfers
      WHERE from_token_account = '${REWARDS_ZEC_ACCOUNT}'
        AND token_mint_address = '${ZEC}'
        AND outer_executing_account = '${TOKEN_PROGRAM}'
        AND to_owner <> '${TREASURY}'
        AND ${dayPartition}
        AND TIME_RANGE
    ),
    minute_prices AS (
      SELECT contract_address, timestamp, price
      FROM prices.minute
      WHERE blockchain = 'solana'
        AND contract_address IN (from_base58('${ZEC}'), from_base58('${SAPLING}'))
        AND timestamp >= date_trunc('minute', from_unixtime(${options.startTimestamp}))
        AND timestamp < from_unixtime(${options.endTimestamp})
    )
    SELECT
      p.part,
      p.token,
      SUM(IF(pr.price IS NULL, 0, p.amount / power(10, IF(p.token = '${ZEC}', 8, 6)) * pr.price)) AS usd,
      SUM(IF(pr.price IS NULL, p.amount, 0)) AS unpriced_amount
    FROM parts p
    LEFT JOIN minute_prices pr
      ON pr.contract_address = from_base58(p.token)
      AND pr.timestamp = date_trunc('minute', p.block_time)
    WHERE p.amount > 0
    GROUP BY 1, 2
  `);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const row of rows) {
    const part = PARTS[row.part];
    if (!part) throw new Error(`sapling: unknown fee part ${row.part}`);
    const [source, destination, metric] = part;
    const add = (balances: any, label: string) => {
      if (Number(row.usd) > 0) balances.addUSDValue(Number(row.usd), label);
      if (Number(row.unpriced_amount) > 0) balances.add(row.token, Number(row.unpriced_amount), label);
    };
    if (source) add(dailyFees, source);
    if (metric === "paid") {
      add(dailyHoldersRevenue, destination);
    } else if (metric === "revenue") {
      add(dailyRevenue, destination);
    } else if (metric === "supply") {
      add(dailySupplySideRevenue, destination);
    } else {
      add(dailyRevenue, destination);
      add(metric === "protocol" ? dailyProtocolRevenue : dailyHoldersRevenue, destination);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "The 2% fee on every buy and sell of a coin launched on Sapling, plus Sapling's fee on buys, plantings and sales made from a Zcash account.",
  Revenue: "The part of the 2% coin trading fee that does not go to deployers: treasury, $SAPLING buyback and burn, $SAPLING/ZEC liquidity, and the deployer share of coins whose deployer chose holder rewards, plus the Zcash account fee.",
  ProtocolRevenue: "The treasury's share: 10% of the 2% coin trading fee, plus the Zcash account fee.",
  HoldersRevenue: "Holder rewards paid in ZEC to the holders of Sapling coins, valued when paid, plus the 50% of the 2% coin trading fee that buys and burns $SAPLING and adds $SAPLING/ZEC liquidity with the LP tokens burned.",
  SupplySideRevenue: "40% of the 2% coin trading fee goes to each coin's deployer or a wallet they choose.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.COIN_FEES]: "The 2% fee on every buy and sell of a coin launched on Sapling, collected and split on chain by the Sapling vault program.",
    [LABELS.ACCOUNT_FEES]: "Sapling's fee on a buy, planting or sale made from a Zcash account.",
  },
  Revenue: {
    [LABELS.TO_TREASURY]: "10% of the 2% coin trading fee, sent to the Sapling treasury.",
    [LABELS.ACCOUNT_TO_TREASURY]: "The Zcash account fee, sent to the Sapling treasury.",
    [LABELS.BUYBACK]: "25% of the 2% coin trading fee, used to buy $SAPLING and burn it (burned directly for coins paired with $SAPLING).",
    [LABELS.LIQUIDITY]: "25% of the 2% coin trading fee, added to $SAPLING/ZEC liquidity with the LP tokens burned (held in a vault per coin before 2026-10-02, then moved into the same liquidity).",
    [LABELS.TO_COIN_HOLDERS]: "40% of the 2% coin trading fee of coins whose deployer chose holder rewards, set aside for the coin's holders.",
  },
  ProtocolRevenue: {
    [LABELS.TO_TREASURY]: "10% of the 2% coin trading fee, sent to the Sapling treasury.",
    [LABELS.ACCOUNT_TO_TREASURY]: "The Zcash account fee, sent to the Sapling treasury.",
  },
  HoldersRevenue: {
    [LABELS.BUYBACK]: "25% of the 2% coin trading fee, used to buy $SAPLING and burn it (burned directly for coins paired with $SAPLING).",
    [LABELS.LIQUIDITY]: "25% of the 2% coin trading fee, added to $SAPLING/ZEC liquidity with the LP tokens burned (held in a vault per coin before 2026-10-02, then moved into the same liquidity).",
    [LABELS.HOLDER_REWARDS]: "Holder rewards paid in ZEC to the holders of coins whose deployer chose holder rewards, valued when paid.",
  },
  SupplySideRevenue: {
    [LABELS.TO_DEPLOYERS]: "40% of the 2% coin trading fee, paid to the coin's deployer or a wallet they choose.",
  },
};

const adapter: SimpleAdapter = {
  version: 1, // Dune
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-25",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
