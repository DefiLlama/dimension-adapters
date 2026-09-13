import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { queryAllium } from '../../helpers/allium';
import { CHAIN } from '../../helpers/chains';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const FEE_WALLET = 'R4rNJHaffSUotNmqSKNEfDcJE8A7zJUkaoM5Jkd7cYX';     // FOMO fee recipient on native Solana swaps
const GAS_SPONSOR = 'AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51';   // FOMO fee payer on all user-initiated txs
const RELAY_VAULT = '7uTT8Xi5RWXzy7h9XL244GRgEycDYDhLjr3ZyNdXi8pZ';   // owner of Relay Depository USDC account (Solana)

const fetch = async (options: FetchOptions) => {
  const timeRange = `block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

  const result = await queryAllium(`
    -- Candidate txs: USDC either paid as fee to FOMO (native swap) or deposited to the Relay vault (cross-chain buy).
    -- signer on solana.assets.transfers is the fee payer, equivalent to Dune solana.transactions.signer.
    WITH candidate_transfers AS (
      SELECT txn_id, from_address, to_address, usd_amount
      FROM solana.assets.transfers
      WHERE ${timeRange}
        AND mint = '${USDC_MINT}'
        AND to_address IN ('${FEE_WALLET}', '${RELAY_VAULT}')
        AND signer = '${GAS_SPONSOR}'
        AND transfer_type = 'spl_token_transfer'
    ),

    -- 1. Native Solana swaps. Allium dex.trades is hop-level; collapse to one row per tx
    -- (FOMO sponsors one user swap per tx; Dune partitioned by (tx_id, trader_id)).
    native_swaps AS (
      SELECT
        t.txn_id,
        t.usd_amount
      FROM solana.dex.trades t
      JOIN (SELECT DISTINCT txn_id FROM candidate_transfers WHERE to_address = '${FEE_WALLET}') f
        ON t.txn_id = f.txn_id
      WHERE ${timeRange}
        AND t.signer = '${GAS_SPONSOR}'
        AND (t.token_bought_mint = '${USDC_MINT}' OR t.token_sold_mint = '${USDC_MINT}')
      QUALIFY ROW_NUMBER() OVER (PARTITION BY t.txn_id ORDER BY t.usd_amount DESC) = 1
    ),

    -- 2. Cross-chain buys: sponsored USDC deposits into the Relay vault
    relay_buys AS (
      SELECT txn_id, from_address AS user_wallet, usd_amount
      FROM candidate_transfers
      WHERE to_address = '${RELAY_VAULT}'
    ),

    -- 3. FOMO user set for the window (fee payer of native swaps; depositor of Relay buys)
    fomo_users AS (
      SELECT DISTINCT from_address AS user_wallet
      FROM candidate_transfers
      WHERE to_address = '${FEE_WALLET}'
        AND txn_id IN (SELECT txn_id FROM native_swaps)
      UNION
      SELECT DISTINCT user_wallet FROM relay_buys
    ),

    -- 4. Cross-chain sells: USDC fills from Relay solvers into FOMO user wallets.
    --    Solvers approximated as wallets that withdrew USDC from the Relay vault in the window.
    relay_solvers AS (
      SELECT DISTINCT to_address AS solver
      FROM solana.assets.transfers
      WHERE ${timeRange}
        AND mint = '${USDC_MINT}'
        AND from_address = '${RELAY_VAULT}'
        AND transfer_type = 'spl_token_transfer'
    ),
    relay_sells AS (
      SELECT tr.txn_id, tr.to_address AS user_wallet, tr.usd_amount
      FROM solana.assets.transfers tr
      JOIN fomo_users u ON tr.to_address = u.user_wallet
      JOIN relay_solvers rs ON tr.from_address = rs.solver
      LEFT JOIN (SELECT DISTINCT txn_id FROM candidate_transfers) s ON tr.txn_id = s.txn_id
      WHERE ${timeRange}
        AND tr.mint = '${USDC_MINT}'
        AND tr.transfer_type = 'spl_token_transfer'
        AND s.txn_id IS NULL
    ),

    all_trades AS (
      SELECT usd_amount FROM native_swaps
      UNION ALL SELECT usd_amount FROM relay_buys
      UNION ALL SELECT usd_amount FROM relay_sells
    )

    SELECT COALESCE(SUM(usd_amount), 0) AS total_volume
    FROM all_trades
  `);

  const row = result[0];
  if (!row) throw new Error(`No FOMO volume row for ${options.dateString}`);

  return { dailyVolume: row.total_volume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-04-01',
  methodology: {
    Volume:
      'USD volume of spot trades initiated through FOMO, measured on Solana where user balances are held. ' +
      'Includes native Solana swaps (identified by FOMO fee transfers in FOMO-sponsored transactions) and cross-chain trades ' +
      'executed via Relay (buys as sponsored USDC deposits into the Relay depository; sells as USDC fills from Relay solvers ' +
      'to FOMO user wallets). Each trade is counted once regardless of destination chain.',
  },
  isExpensiveAdapter: true,
  doublecounted: true,
};

export default adapter;
