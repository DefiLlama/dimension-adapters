import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryDuneSql } from '../helpers/dune';

// Same attribution as dexs/fomo: FOMO-sponsored native Solana swaps plus Relay
// cross-chain buys/sells, counted on Solana where user balances are held.
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const FEE_WALLET = 'R4rNJHaffSUotNmqSKNEfDcJE8A7zJUkaoM5Jkd7cYX';     // FOMO fee recipient on native Solana swaps
const GAS_SPONSOR = 'AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51';   // FOMO fee payer on all user-initiated txs
const RELAY_VAULT = '7uTT8Xi5RWXzy7h9XL244GRgEycDYDhLjr3ZyNdXi8pZ';   // owner of Relay Depository USDC account (Solana)

const fetch = async (options: FetchOptions) => {
  const tenHoursAgo = Date.now() - 10 * 60 * 60 * 1000;
  if (options.toTimestamp * 1000 > tenHoursAgo) {
    throw new Error('End timestamp is less than 10 hours ago, skipping due to dune indexing delay');
  }

  const result = await queryDuneSql(options, `
    -- Candidate txs: USDC either paid as fee to FOMO (native swap) or deposited to the Relay vault (cross-chain buy)
    WITH candidate_transfers AS (
      SELECT tx_id, from_owner, to_owner
      FROM tokens_solana.transfers
      WHERE TIME_RANGE
        AND token_mint_address = '${USDC_MINT}'
        AND to_owner IN ('${FEE_WALLET}', '${RELAY_VAULT}')
    ),

    -- Keep only the ones FOMO sponsored (first signer = fee payer)
    sponsored AS (
      SELECT DISTINCT tx.id AS tx_id
      FROM solana.transactions tx
      JOIN (SELECT DISTINCT tx_id FROM candidate_transfers) c ON tx.id = c.tx_id
      WHERE TIME_RANGE
        AND tx.signer = '${GAS_SPONSOR}'
    ),

    -- 1. Native Solana swaps
    native_swaps AS (
      SELECT
        t.tx_id,
        t.trader_id AS user_wallet,
        ROW_NUMBER() OVER (PARTITION BY t.tx_id, t.trader_id ORDER BY t.amount_usd DESC) AS rn
      FROM dex_solana.trades t
      JOIN sponsored s ON t.tx_id = s.tx_id
      JOIN (SELECT DISTINCT tx_id FROM candidate_transfers WHERE to_owner = '${FEE_WALLET}') f ON t.tx_id = f.tx_id
      WHERE TIME_RANGE
        AND t.trader_id != '${FEE_WALLET}'
        AND (t.token_bought_mint_address = '${USDC_MINT}' OR t.token_sold_mint_address = '${USDC_MINT}')
    ),

    -- 2. Cross-chain buys: sponsored USDC deposits into the Relay vault
    relay_buys AS (
      SELECT c.tx_id, c.from_owner AS user_wallet
      FROM candidate_transfers c
      JOIN sponsored s ON c.tx_id = s.tx_id
      WHERE c.to_owner = '${RELAY_VAULT}'
    ),

    -- 3. FOMO user set for the window
    fomo_users AS (
      SELECT DISTINCT user_wallet FROM relay_buys
      UNION
      SELECT DISTINCT user_wallet FROM native_swaps
    ),

    -- 4. Cross-chain sells: USDC fills from Relay solvers into FOMO user wallets.
    --    Solvers approximated as wallets that withdrew USDC from the Relay vault in the window.
    relay_solvers AS (
      SELECT DISTINCT to_owner AS solver
      FROM tokens_solana.transfers
      WHERE TIME_RANGE
        AND token_mint_address = '${USDC_MINT}'
        AND from_owner = '${RELAY_VAULT}'
    ),
    relay_sells AS (
      SELECT tr.tx_id, tr.to_owner AS user_wallet
      FROM tokens_solana.transfers tr
      JOIN fomo_users u ON tr.to_owner = u.user_wallet
      JOIN relay_solvers rs ON tr.from_owner = rs.solver
      LEFT JOIN sponsored s ON tr.tx_id = s.tx_id
      WHERE TIME_RANGE
        AND tr.token_mint_address = '${USDC_MINT}'
        AND s.tx_id IS NULL
    ),

    all_trades AS (
      SELECT tx_id, user_wallet FROM native_swaps WHERE rn = 1
      UNION ALL SELECT tx_id, user_wallet FROM relay_buys
      UNION ALL SELECT tx_id, user_wallet FROM relay_sells
    )

    SELECT
      COUNT(DISTINCT user_wallet) AS active_users,
      COUNT(*)                    AS trades
    FROM all_trades
  `);

  const row = result[0];
  if (!row) throw new Error(`No FOMO user data for ${options.dateString}`);

  return {
    dailyActiveUsers: row.active_users,
    dailyTransactionsCount: row.trades,
  };
};

// version 1: dailyActiveUsers is a daily-unique count and cannot be summed from
// hourly slices, and all Dune adapters are version 1.
const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-03-01',
  methodology: {
    ActiveUsers:
      'Unique wallets that traded through FOMO that day, counted on Solana where user balances are held. Includes native Solana swaps (FOMO-sponsored transactions that pay a USDC fee to FOMO) and cross-chain trades via Relay (buys as sponsored USDC deposits into the Relay depository; sells as USDC fills from Relay solvers to FOMO user wallets).',
    TransactionsCount:
      'Number of FOMO spot trades that day, counted on Solana. Includes native Solana swaps and Relay cross-chain buys and sells, each counted once regardless of destination chain.',
  },
  isExpensiveAdapter: true,
};

export default adapter;
