
import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    trade_date: string;
    chain: string;
    daily_trades: number;
    daily_usd_volume: number;
}

const chainsMap: Record<string, string> = {
    "ethereum": CHAIN.ETHEREUM,
    "base": CHAIN.BASE,
    "bnb": CHAIN.BSC,
    "sonic": CHAIN.SONIC,
    "tron": CHAIN.TRON,
    "sol": CHAIN.SOLANA
};

const prefetch = async (options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `
        WITH recent_evm_orders AS (
            SELECT
                evt_tx_hash,
                evt_block_time,
                DATE(evt_block_time) as trade_date,
                chain
            FROM liquidmesh_multichain.liquidmeshrouter_evt_orderrecord
            WHERE
                 evt_block_time >= from_unixtime(${options.startTimestamp})
                 AND evt_block_time < from_unixtime(${options.endTimestamp})
        ),

        recent_lm_sol_tx AS (
             
            select
               evt_tx_id as evt_tx_hash,
               evt_block_time as evt_block_time,
               date(evt_block_time)  as trade_date
            from
                liquidmesh_solana.liquid_mesh_router_evt_liquidmeshswapevent
            where date(evt_block_time) >= date(from_unixtime(${options.startTimestamp}))
                  AND date(evt_block_time) < date(from_unixtime(${options.endTimestamp}))
                  
      ),

         recent_evm_trade AS (
           SELECT
              tx_hash,
              blockchain,
              sum(amount_usd) as amount_usd
              FROM dex.trades 
              where block_time >= from_unixtime(${options.startTimestamp})
                    AND block_time < from_unixtime(${options.endTimestamp})
              group by tx_hash,blockchain
        ),
        recent_sol_trade AS (
             select
                  tx_id as tx_hash,
                  sum(amount_usd) as amount_usd
              from dex_solana.trades
                  where date(block_time) >= date(from_unixtime(${options.startTimestamp}))
                        AND date(block_time) < date(from_unixtime(${options.endTimestamp}))
                          and block_month >= date '2025-08-01'
                      group by
                          tx_id
      ),

         evm_orders_with_usd AS (
            SELECT
                o.trade_date,
                o.evt_tx_hash,
                o.evt_block_time,
                o.chain,
                rt.amount_usd
            FROM recent_evm_orders o
            LEFT JOIN recent_evm_trade rt ON
                 rt.tx_hash=o.evt_tx_hash
                 and o.chain=rt.blockchain
        ),
        sol_orders_with_usd AS (
              SELECT
                o.trade_date,
                o.evt_tx_hash,
                o.evt_block_time,
                'sol' as chain,
                rt.amount_usd
            FROM recent_lm_sol_tx o
            LEFT JOIN recent_sol_trade rt ON
                 rt.tx_hash=o.evt_tx_hash
        )

        SELECT
            trade_date,
            chain,
            COUNT(*) as daily_trades,
            SUM(amount_usd) as daily_usd_volume
        FROM evm_orders_with_usd
        GROUP BY trade_date,chain

        UNION ALL
        SELECT
            trade_date,
            chain,
            COUNT(*) as daily_trades,
            SUM(amount_usd) as daily_usd_volume
        FROM sol_orders_with_usd
        GROUP BY trade_date,chain
    `);
    
    return data;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const results: IData[] = options.preFetchedResults || [];
    const chainData = results.find(
        (item) => chainsMap[item.chain.toLowerCase()] === options.chain && 
                 item.trade_date === options.dateString
    );
    
    return {
        dailyVolume: chainData?.daily_usd_volume || 0,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    dependencies: [Dependencies.DUNE],
    adapter: Object.values(chainsMap).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: fetch,
                start: '2025-08-01',
            },
        };
    }, {}),
    prefetch: prefetch,
    methodology: {
        Volume: "Tracks the trading volume across all supported chains through LiquidMesh aggregator",
    },
    isExpensiveAdapter: true
}

export default adapter