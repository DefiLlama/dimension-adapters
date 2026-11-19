import { Balances } from '@defillama/sdk';
import { FetchOptions } from '../../adapters/types';
import { getAlliumChain, queryAllium } from '../allium';
import { CHAIN } from '../chains';
import ADDRESSES from '../coreAssets.json';

// https://bscscan.com/tx/0x99971e414cdb5fdf2fe0d15c081efdd1f970ff03a6c3b95ed12616ce3a23a9c3
export const FEE_WALLET = '0xd64a453da8fcdd049697aa5c6dabfff09916c795';
// https://explorer.solana.com/tx/371nFQmdZ7oFvttwQLu8ratU4tcL5bTMzFx5Ma17gCVaA185RfXKBT7Sx5JFe7XaJBN992ZYVRFFDqVbrvBX5F7w
const SOLANA_FEE_OWNER = '8EQkAYq6vEP9VVeiGQtZhKZtkBySRmoQGDZeEU8hJDcy';
// Rango diamond: https://docs.rango.exchange/smart-contracts/deployment-addresses
export const RANGO = '0x69460570c93f9de5e2edbc3052bf10125f0ca22d';
// OKX DEX router OrderRecord(fromToken, toToken, sender, fromAmount, returnAmount), not decoded by Allium on every chain
const OKX_ORDER_RECORD = '0x1bb43f2da90e35f7b0cf38521ca95a49e68eb42fac49924930a5bd73cdf7576c';
// 1inch AggregationRouterV6 swap(), not decoded by Allium on Robinhood
const ONEINCH_SWAP = '0x07ed2379';

export const chainConfig: Record<string, { start: string }> = {
  [CHAIN.ETHEREUM]: { start: '2025-05-15' },
  [CHAIN.BSC]: { start: '2025-05-15' },
  [CHAIN.BASE]: { start: '2025-05-20' },
  [CHAIN.POLYGON]: { start: '2025-05-27' },
  [CHAIN.ARBITRUM]: { start: '2025-05-30' },
  [CHAIN.OPTIMISM]: { start: '2025-05-31' },
  [CHAIN.AVAX]: { start: '2025-06-06' },
  [CHAIN.ROBINHOOD]: { start: '2026-09-01' },
  [CHAIN.SOLANA]: { start: '2025-05-21' },
};

export type WalletVRow = { kind: 'volume' | 'swap' | 'rango'; token: string; amount: string };

const NATIVE = new Set([ADDRESSES.null, ADDRESSES.GAS_TOKEN_2]);

export function addToken(balances: Balances, token: string, amount: string | bigint, label?: string) {
  if (BigInt(amount) <= 0n) return;
  if (NATIVE.has(token.toLowerCase())) balances.addGasToken(amount, label);
  else balances.add(token, amount, label);
}

function evmCtes(chain: string, time: string): string {
  return `
    inflows AS (
      SELECT transaction_hash AS tx, IFF(from_address = '${RANGO}', 'rango', 'swap') AS kind,
        token_address AS token, raw_amount_str AS amount, usd_amount
      FROM crosschain.assets.transfers
      WHERE chain = '${chain}' AND ${time} AND to_address = '${FEE_WALLET}'
        AND from_address <> '${FEE_WALLET}' AND transaction_from_address <> '${FEE_WALLET}'
    ),
    decoded AS (
      SELECT transaction_hash AS tx, token_sold_address AS token, token_sold_amount_raw_str AS amount,
        LEAST(COALESCE(usd_sold_amount, usd_bought_amount), COALESCE(usd_bought_amount, usd_sold_amount)) AS usd
      FROM crosschain.dex.aggregator_trades
      WHERE chain = '${chain}' AND ${time} AND transaction_hash IN (SELECT tx FROM inflows)
      QUALIFY ROW_NUMBER() OVER (PARTITION BY transaction_hash ORDER BY usd DESC NULLS LAST, unique_id) = 1
    ),
    okx AS (
      SELECT transaction_hash AS tx, '0x' || SUBSTR(data, 27, 40) AS token, '0x' || SUBSTR(data, 195, 64) AS amount
      FROM ${chain}.raw.logs
      WHERE ${time} AND topic0 = '${OKX_ORDER_RECORD}' AND transaction_hash IN (SELECT tx FROM inflows)
      QUALIFY ROW_NUMBER() OVER (PARTITION BY transaction_hash ORDER BY log_index) = 1
    ),
    oneinch AS (
      SELECT transaction_hash AS tx, '0x' || SUBSTR(input, 99, 40) AS token, '0x' || SUBSTR(input, 331, 64) AS amount
      FROM ${chain}.raw.traces
      WHERE ${time} AND selector = '${ONEINCH_SWAP}' AND status = 1 AND error IS NULL AND call_type = 'call'
        AND SUBSTR(input, 291, 40) <> '${FEE_WALLET.slice(2)}' AND transaction_hash IN (SELECT tx FROM inflows)
      QUALIFY ROW_NUMBER() OVER (PARTITION BY transaction_hash ORDER BY trace_id) = 1
    ),
    all_swaps AS (
      SELECT * FROM decoded
      UNION ALL
      SELECT tx, token, amount, NULL FROM okx WHERE tx NOT IN (SELECT tx FROM decoded)
      UNION ALL
      SELECT tx, token, amount, NULL FROM oneinch WHERE tx NOT IN (SELECT tx FROM decoded) AND tx NOT IN (SELECT tx FROM okx)
    )`;
}

function solanaCtes(time: string): string {
  return `
    inflows AS (
      SELECT txn_id AS tx, 'swap' AS kind, mint AS token, raw_amount_str AS amount, usd_amount
      FROM solana.assets.transfers
      WHERE ${time} AND to_address = '${SOLANA_FEE_OWNER}'
        AND from_address <> '${SOLANA_FEE_OWNER}' AND signer <> '${SOLANA_FEE_OWNER}'
    ),
    all_swaps AS (
      SELECT txn_id AS tx, token_sold_mint AS token, token_sold_amount_raw_str AS amount, usd_amount AS usd
      FROM solana.dex.aggregator_trades
      WHERE ${time} AND txn_id IN (SELECT tx FROM inflows)
      QUALIFY ROW_NUMBER() OVER (PARTITION BY txn_id ORDER BY usd_amount DESC NULLS LAST, unique_id) = 1
    )`;
}

/** Fee-wallet inflows in transactions holding an aggregator swap, and that swap's input as volume. */
export async function fetchWalletV(options: FetchOptions): Promise<WalletVRow[]> {
  const { startTimestamp: from, endTimestamp: to } = options;
  const time = `block_timestamp >= TO_TIMESTAMP_NTZ(${from}) AND block_timestamp < TO_TIMESTAMP_NTZ(${to})`;
  const solana = options.chain === CHAIN.SOLANA;
  const chain = getAlliumChain(options.chain);
  const tables = solana
    ? ['solana.assets.transfers', 'solana.dex.aggregator_trades']
    : ['crosschain.assets.transfers', 'crosschain.dex.aggregator_trades'];
  const indexed = tables.map(table => `EXISTS (SELECT 1 FROM ${table} WHERE ${solana ? '' : `chain = '${chain}' AND `}
    block_timestamp >= TO_TIMESTAMP_NTZ(${to}) AND block_timestamp < TO_TIMESTAMP_NTZ(${to + 86400}))`).join(' AND ');

  const rows = await queryAllium(`
    WITH ${solana ? solanaCtes(time) : evmCtes(chain, time)},
    fee_txs AS (SELECT tx, SUM(usd_amount) AS fee_usd FROM inflows WHERE kind = 'swap' GROUP BY 1),
    valid AS (
      SELECT s.* FROM all_swaps s JOIN fee_txs f ON f.tx = s.tx
      -- an inflow worth half the swap is its output or a mispriced token, not a commission
      WHERE s.usd IS NULL OR f.fee_usd IS NULL OR f.fee_usd < 0.5 * s.usd
    ),
    data_rows AS (
      SELECT 'volume' AS kind, token, amount FROM valid
      UNION ALL
      SELECT kind, token, amount FROM inflows WHERE kind = 'rango' OR tx IN (SELECT tx FROM valid)
    ),
    ready AS (SELECT ${indexed} AS ok)
    SELECT r.ok AS ready, d.kind, d.token, d.amount FROM ready r LEFT JOIN data_rows d ON TRUE
  `);
  if (!rows[0]?.ready) throw new Error(`Wallet V ${options.chain}: Allium has not indexed past ${new Date(to * 1000).toISOString()}`);
  if (rows.length >= 10_000) throw new Error(`Wallet V ${options.chain}: Allium row cap reached`);
  return rows.filter((row: WalletVRow) => row.kind);
}
