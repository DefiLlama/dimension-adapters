import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { FetchOptions } from "../../adapters/types";

interface IData {
  vol_clean: number;
}

const QUOTE_TOKENS = [
  ADDRESSES.solana.SOL,
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  ADDRESSES.solana.USDC,
  ADDRESSES.solana.USDT,
  ADDRESSES.solana.PUMP,
  'DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT',
].map((a) => `'${a}'`).join(',')

const fetch = async (options: FetchOptions) => {
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
          SUM(usd_amount) as volume_usd
        FROM solana.dex.trades
        WHERE project = 'pumpswap'
          AND block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
          AND block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
          AND pool IN (SELECT liquidity_pool_address FROM pool_filter)
        GROUP BY pool, sender_token_acc
      ),
      pool_volume AS (
        SELECT
          pool,
          SUM(volume_usd) as total_volume_usd,
          COUNT(DISTINCT sender_token_acc) as unique_traders
        FROM volume_data
        GROUP BY pool
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
        SUM(CASE
          WHEN pt.total_tvl_usd >= 5000 AND pv.unique_traders >= 50 THEN pv.total_volume_usd
          ELSE 0
        END) as vol_clean
      FROM pool_volume pv
      INNER JOIN pool_tvl pt ON pv.pool = pt.liquidity_pool_address`
  
  const [row]: IData[] = await queryAllium(query);
  const cleanVolume = row?.vol_clean ?? 0

  const dailyVolume = options.createBalances()
  dailyVolume.addCGToken('tether', cleanVolume);

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
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Volume: "Volume is the total volume of all pools on PumpSwap where the base/quote token is SOL, mSOL, USDC, USDT, PUMP, or BONK, and the pool has TVL >= $5,000 and at least 50 unique traders. This filters out wash trading pools.",
  }
}

export default adapter
