import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { FetchOptions } from "../../adapters/types";

// const queryId = "4900425"; // removed direct query so changes in query don't affect the data, and better visibility

interface IData {
  clean_volume: number;
  total_volume: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data: IData[] = await queryAllium(
    `WITH volume_data AS (
            SELECT 
              pool,
              SUM(usd_amount) as volume_usd
            FROM solana.dex.trades
            WHERE project = 'pumpswap'
              AND block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
              AND block_timestamp <= TO_TIMESTAMP_NTZ('${options.endTimestamp}')
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
              AND liquidity_pool_address IN (SELECT pool FROM volume_data)
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
            SUM(vd.volume_usd) as total_volume,
            SUM(CASE 
              WHEN pt.total_tvl_usd >= 5000 THEN vd.volume_usd 
              ELSE 0 
            END) as clean_volume
          FROM volume_data vd
          LEFT JOIN pool_tvl pt ON vd.pool = pt.liquidity_pool_address
          WHERE pt.liquidity_pool_address IS NOT NULL
    `)
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
    Volume: "Volume is the total volume of all pools on PumpSwap, excluding pools with a TVL less than $5,000.",
  }
}

export default adapter
