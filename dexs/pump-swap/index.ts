import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
  quote_mint: string;
  quote_amount_raw: string;
}

const STATIC_QUOTE_TOKENS = [
  ADDRESSES.solana.SOL,
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  ADDRESSES.solana.USDC,
  ADDRESSES.solana.USDT,
  ADDRESSES.solana.PUMP,
  'DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT',
]

// Custom Pairs (https://pump.fun/docs/custom-pairs): any external quote asset the pump.fun bonding-curve program
// has accepted for a launch, read from its CreateEvent on Dune as of the window end so refills reproduce history.
// Coins launched on pump.fun itself are never accepted as a quote (coin-quoted-in-coin pairs are open to anyone
// and priced off a thin coin the launcher controls). Allium decodes every pump.fun curve as SOL-quoted, so the
// set cannot come from the same warehouse. PumpSwap pool creation is permissionless, so this (plus the static
// list) is the pump-sanctioned quote set.
const getPumpQuoteMints = async (options: FetchOptions): Promise<string[]> => {
  const rows = await queryDuneSql(options, `
    SELECT DISTINCT quote_mint
    FROM pumpdotfun_solana.pump_evt_createevent
    WHERE quote_mint IS NOT NULL
      AND quote_mint <> '11111111111111111111111111111111'
      AND evt_block_time < from_unixtime(${options.endTimestamp})
      AND quote_mint NOT IN (SELECT mint FROM pumpdotfun_solana.pump_evt_createevent)
  `)
  return rows.map((r: any) => r.quote_mint)
}

// Volume is the quote-side amount of each trade, summed per quote mint and priced by DefiLlama's own feed
// (Allium's usd_amount is only used for the pool TVL wash filter), so a quote DefiLlama cannot price adds nothing.
const fetch = async (options: FetchOptions) => {
  const QUOTE_TOKENS = [...new Set([...STATIC_QUOTE_TOKENS, ...await getPumpQuoteMints(options)])].map((a) => `'${a}'`).join(',')
  const query = `WITH pool_filter AS (
        SELECT DISTINCT
          liquidity_pool_address
        FROM solana.dex.pools
        WHERE project = 'pumpswap'
          AND (
            token0_address IN (${QUOTE_TOKENS})
            OR token1_address IN (${QUOTE_TOKENS})
          )
      ),
      volume_data AS (
        SELECT
          pool,
          sender_token_acc,
          CASE WHEN token_sold_mint IN (${QUOTE_TOKENS}) THEN token_sold_mint ELSE token_bought_mint END AS quote_mint,
          SUM(CASE WHEN token_sold_mint IN (${QUOTE_TOKENS}) THEN token_sold_amount_raw ELSE token_bought_amount_raw END) AS quote_amount_raw
        FROM solana.dex.trades
        WHERE project = 'pumpswap'
          AND block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
          AND block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
          AND pool IN (SELECT liquidity_pool_address FROM pool_filter)
        GROUP BY pool, sender_token_acc, quote_mint
      ),
      pool_volume AS (
        SELECT
          pool,
          quote_mint,
          SUM(quote_amount_raw) as quote_amount_raw,
          COUNT(DISTINCT sender_token_acc) as unique_traders
        FROM volume_data
        GROUP BY pool, quote_mint
      ),
      pool_info AS (
        SELECT DISTINCT
          liquidity_pool_address,
          token0_address,
          token0_vault,
          token1_address,
          token1_vault
        FROM solana.dex.pools
        WHERE project = 'pumpswap'
          AND liquidity_pool_address IN (SELECT pool FROM pool_volume)
      ),
      pool_vaults AS (
        SELECT liquidity_pool_address AS pool, token0_vault AS vault, token0_address AS mint FROM pool_info
        UNION ALL
        SELECT liquidity_pool_address AS pool, token1_vault AS vault, token1_address AS mint FROM pool_info
      ),
      vault_bal AS (
        SELECT token_account, mint, usd_amount
        FROM solana.assets.balances_daily
        WHERE date >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
          AND date < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
          AND token_account IN (SELECT vault FROM pool_vaults)
      ),
      pool_tvl AS (
        SELECT
          pvault.pool as liquidity_pool_address,
          SUM(vb.usd_amount) as total_tvl_usd
        FROM pool_vaults pvault
        JOIN vault_bal vb
          ON vb.token_account = pvault.vault
          AND vb.mint = pvault.mint
        GROUP BY pvault.pool
      )
      SELECT
        pv.quote_mint,
        TO_VARCHAR(SUM(pv.quote_amount_raw)) as quote_amount_raw
      FROM pool_volume pv
      INNER JOIN pool_tvl pt ON pv.pool = pt.liquidity_pool_address
      WHERE pt.total_tvl_usd >= 5000 AND pv.unique_traders >= 50
      GROUP BY pv.quote_mint`
  
  const rows: IData[] = await queryAllium(query);
  if (!rows.length) throw new Error('no PumpSwap trades for the window')

  const dailyVolume = options.createBalances()
  for (const { quote_mint, quote_amount_raw } of rows) dailyVolume.add(quote_mint, quote_amount_raw)

  return {
    dailyVolume,
  }
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-02-20',
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM, Dependencies.DUNE],
  methodology: {
    Volume: "Quote-side amount of every trade in PumpSwap pools whose quote token is SOL, mSOL, USDC, USDT, PUMP, BONK or any external pump.fun Custom Pair asset (tokenized stocks, WBTC, ...), priced by DefiLlama, where the pool has TVL >= $5,000 and at least 50 unique traders. Pools quoted in another pump.fun coin are excluded. This filters out wash trading pools.",
  }
}

export default adapter
