import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { FetchOptions } from "../../adapters/types";

interface IData {
  clean_volume: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data: IData[] = await queryAllium(
    `WITH volume_data AS (
      SELECT 
        pool,
        sender_token_acc,
        SUM(usd_amount) as volume_usd
      FROM solana.dex.trades
      WHERE project = 'pumpswap'
        AND block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
        AND block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
      GROUP BY pool, sender_token_acc
    ),
    pool_volume AS (
      SELECT 
        pool,
        SUM(volume_usd) as total_volume_usd,
        COUNT(DISTINCT sender_token_acc) as unique_senders
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
    pool_tvl AS (
      SELECT 
        pi.liquidity_pool_address,
        COALESCE(b0.usd_balance_current, 0) + COALESCE(b1.usd_balance_current, 0) as total_tvl_usd
      FROM pool_info pi
      LEFT JOIN solana.assets.balances_latest b0 
        ON pi.token0_vault = b0.address 
        AND pi.token0_address = b0.mint
      LEFT JOIN solana.assets.balances_latest b1 
        ON pi.token1_vault = b1.address 
        AND pi.token1_address = b1.mint
    )
    SELECT 
      SUM(CASE 
        WHEN pt.total_tvl_usd >= 5000 AND pv.unique_senders >= 50 THEN pv.total_volume_usd 
        ELSE 0 
      END) as clean_volume
    FROM pool_volume pv
    INNER JOIN pool_tvl pt ON pv.pool = pt.liquidity_pool_address
  `);
  const dailyVolume = options.createBalances()
  dailyVolume.addCGToken('tether', data[0].clean_volume);

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
    Volume: "Volume is the total volume of all pools on PumpSwap, excluding pools with TVL < $5,000 or fewer than 50 unique traders.",
  }
}

export default adapter
