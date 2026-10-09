import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { METRIC } from "../helpers/metrics";
import { CONFIGS_CREATED, LAUNCH_CONFIGS, LAUNCH_POOL_PAYER } from "./ryntra-launch";

// Ryntra (https://ryntra.io) is a trading app: people swap and trade spot, memes and tokenized stocks through it, and
// it charges its own fee inside the trade's transaction. A trade is Ryntra's when it paid that fee. Every address
// below is in Ryntra's public attribution registry (https://ryntra.io/api/stats/registry, drawn on
// https://ryntra.io/stats). Every trade is routed through a venue that already lists it (Jupiter and the pools it
// crosses), so the volume is double counted. Tokens launched with Ryntra are the Ryntra Launch listing
// (dexs/ryntra-launch.ts).

const JUPITER_REFERRAL = "F9pV233uBksW4U1BKiK7u9qShgXkwoR6F8MzU4FZYPUv";
const FEE_WALLET = "5sWCoxARMPyGdqTu9ru6z69REZ1ZZLojcb1rfABDP2Ne";
const FEE_ACCOUNTS = [
  { account: "A3QWi67fFpQ2PrGXghjLMQdWAkHeN43NbFp9FxpCeorY", mint: ADDRESSES.solana.SOL, recipient: "jupiter-referral" },
  { account: "55p9Zk8tzq6YhnPgopW5X1sX5kHX1v1zuRiQNwqa5hYH", mint: ADDRESSES.solana.USDC, recipient: "jupiter-referral" },
  { account: "4kbERimV3PwxwiL72n1NBRpX5HG2Mwja1QNhb4yEp578", mint: ADDRESSES.solana.SOL, recipient: "fee-wallet" },
  { account: "GfZQv5L2fAmqNgMsUv97ecV3MUF8GYs7rE7K4ySJDhod", mint: ADDRESSES.solana.USDC, recipient: "fee-wallet" },
  { account: "3QzAhYsiAXEWB64FHwmms63sZcbBKtC1hkPENFMAjMbA", mint: ADDRESSES.solana.USDT, recipient: "fee-wallet" },
];
const ROUTERS = ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH"];

const quoted = (values: string[]) => values.map((value) => `'${value}'`).join(", ");

const query = ({ startTimestamp, endTimestamp }: FetchOptions) => {
  const window = (column: string) => `${column} >= from_unixtime(${startTimestamp}) AND ${column} < from_unixtime(${endTimestamp})`;
  return `
    WITH
    fee_accounts (token_account, mint, recipient) AS (
      VALUES ${FEE_ACCOUNTS.map(({ account, mint, recipient }) => `('${account}', '${mint}', '${recipient}')`).join(", ")}
    ),
    -- The fee, paid into those accounts by a swap router inside the trade. A plain transfer into them (a deposit,
    -- account rent) and Ryntra's own transactions are not fees.
    fees AS (
      SELECT t.tx_id, t.tx_signer AS trader, a.recipient, t.token_mint_address AS mint, CAST(t.amount AS DECIMAL(38, 0)) AS amount
      FROM tokens_solana.transfers t
      JOIN fee_accounts a ON a.token_account = t.to_token_account AND a.mint = t.token_mint_address
      WHERE ${window("t.block_time")}
        AND t.action = 'transfer'
        AND t.outer_executing_account IN (${quoted(ROUTERS)})
        AND t.tx_signer NOT IN (${quoted([JUPITER_REFERRAL, FEE_WALLET])})
    ),
    -- Trades that crossed the bonding curve of a token launched with Ryntra Launch are that listing's volume. A trade
    -- in a graduated pool stays here: Ryntra Launch counts curve volume only.
    launch_trades AS (
      SELECT DISTINCT s.evt_tx_id AS tx_id
      FROM meteora_solana.dynamic_bonding_curve_evt_evtswap2 s
      JOIN meteora_solana.dynamic_bonding_curve_evt_evtinitializepool p ON p.pool = s.pool
      WHERE ${window("s.evt_block_time")}
        AND p.config IN (${quoted(LAUNCH_CONFIGS)})
        AND p.evt_tx_signer = '${LAUNCH_POOL_PAYER}'
        AND p.evt_block_time >= TIMESTAMP '${CONFIGS_CREATED}'
    ),
    trades AS (
      SELECT DISTINCT tx_id, trader FROM fees WHERE tx_id NOT IN (SELECT tx_id FROM launch_trades)
    ),
    -- The trader's own token movements in each trade, per mint (SPL tokens; SOL counts as the wSOL it is swapped as).
    legs AS (
      SELECT t.tx_id, t.token_mint_address AS mint,
        SUM(CASE WHEN t.to_owner = x.trader THEN CAST(t.amount AS DECIMAL(38, 0)) ELSE 0 END)
          - SUM(CASE WHEN t.from_owner = x.trader THEN CAST(t.amount AS DECIMAL(38, 0)) ELSE 0 END) AS net
      FROM tokens_solana.transfers t
      JOIN trades x ON x.tx_id = t.tx_id
      WHERE ${window("t.block_time")}
        AND t.action = 'transfer'
        AND t.token_version <> 'native'
        AND (t.to_owner = x.trader OR t.from_owner = x.trader)
      GROUP BY 1, 2
    ),
    -- One side of each trade, in a token that can be priced: the stablecoin paid, else received; else SOL; else the
    -- token paid.
    sides AS (
      SELECT mint, ABS(net) AS amount,
        ROW_NUMBER() OVER (
          PARTITION BY tx_id
          ORDER BY
            CASE WHEN mint IN (${quoted([ADDRESSES.solana.USDC, ADDRESSES.solana.USDT])}) THEN 0 WHEN mint = '${ADDRESSES.solana.SOL}' THEN 1 ELSE 2 END,
            CASE WHEN net < 0 THEN 0 ELSE 1 END
        ) AS pick
      FROM legs
      WHERE net <> 0
    )
    SELECT 'fees' AS metric, recipient, mint, CAST(SUM(amount) AS VARCHAR) AS amount FROM fees GROUP BY 2, 3
    UNION ALL
    SELECT 'volume', NULL, mint, CAST(SUM(amount) AS VARCHAR) FROM sides WHERE pick = 1 GROUP BY 3
  `;
};

const LABELS = {
  TO_RYNTRA: "Trading Fees To Ryntra",
  TO_JUPITER: "Trading Fees To Jupiter",
};

// Jupiter takes 20% of an integrator's referral fee when it is claimed
// (https://developers.jup.ag/docs/swap/order-and-execute#how-it-works); nothing of what Jupiter /build pays the fee
// wallet (https://developers.jup.ag/docs/swap/build/index#fees).
const JUPITER_SHARE_PERCENT = 20n;

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);
  const rows: { metric: string; recipient: string; mint: string; amount: string }[] = await queryDuneSql(options, query(options));

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  for (const row of rows) {
    if (row.metric === "volume") {
      dailyVolume.add(row.mint, row.amount);
      continue;
    }
    const amount = BigInt(row.amount);
    const jupiter = row.recipient === "jupiter-referral" ? (amount * JUPITER_SHARE_PERCENT) / 100n : 0n;
    dailyFees.add(row.mint, amount, METRIC.TRADING_FEES);
    dailyRevenue.add(row.mint, amount - jupiter, LABELS.TO_RYNTRA);
    if (jupiter > 0n) dailySupplySideRevenue.add(row.mint, jupiter, LABELS.TO_JUPITER);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "One side of every trade made through Ryntra, from the trader's own token movements in the trade: the stablecoin they paid or received, else the SOL, else the token they paid. A trade is Ryntra's when it paid Ryntra's fee inside it. Trades on the bonding curve of a token launched with Ryntra are counted under Ryntra Launch. Double counted: the venues the trades are routed through already list this volume.",
  Fees: "Fees people pay Ryntra on trades made through it: what the swap router (Jupiter, or DFlow when Jupiter routes through it) pays into Ryntra's fee wallet and its Jupiter referral account inside the trade. Plain transfers into those accounts are not fees.",
  UserFees: "Fees traders pay Ryntra inside the trades they make through it.",
  Revenue: "Trading fees kept by Ryntra: the whole fee paid into its fee wallet, and what reached its Jupiter referral account less Jupiter's 20% share. Cashback and invite rewards are paid later, when people claim them, and are not deducted.",
  ProtocolRevenue: "Trading fees kept by Ryntra, all of it for the protocol: Ryntra has no token and distributes nothing to holders.",
  SupplySideRevenue: "Jupiter's 20% share of the fees that reached Ryntra's Jupiter referral account.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Ryntra's fee on swaps and spot trades, paid into its fee wallet or its Jupiter referral account inside the trade.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Ryntra's fee on swaps and spot trades, paid by the trader inside the trade.",
  },
  Revenue: {
    [LABELS.TO_RYNTRA]: "The whole fee paid into the fee wallet, and 80% of what reached the Jupiter referral account.",
  },
  ProtocolRevenue: {
    [LABELS.TO_RYNTRA]: "The whole fee paid into the fee wallet, and 80% of what reached the Jupiter referral account.",
  },
  SupplySideRevenue: {
    [LABELS.TO_JUPITER]: "Jupiter's 20% share of the fees that reached Ryntra's Jupiter referral account.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-10",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
