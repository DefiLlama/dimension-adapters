import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune, queryDuneSql } from "../helpers/dune";

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const res = await queryDuneSql(options, `
    WITH created_contracts AS (
        SELECT 
            'Clanker' AS projects
            , tokenAddress 
        FROM 
            socialdex_base.SocialDexDeployer_evt_TokenCreated
        WHERE evt_block_time > TIMESTAMP '2024-11-27'
            AND evt_block_time <= from_unixtime(${options.endTimestamp})

        UNION ALL
        
        SELECT
            'Clanker' as projects
            , tokenAddress 
        FROM clanker_base.Clanker_V1_evt_TokenCreated
        WHERE evt_block_time > TIMESTAMP '2024-11-27'
            AND evt_block_time <= from_unixtime(${options.endTimestamp})

        UNION ALL
        
        SELECT
          'Clanker' as projects
            , tokenAddress 
        FROM clanker_base.Clanker_v2_evt_TokenCreated
        WHERE evt_block_time > TIMESTAMP '2024-11-08'
            AND evt_block_time <= from_unixtime(${options.endTimestamp})

        UNION ALL
        
        SELECT
          'Clanker' as projects
            , tokenAddress 
        FROM clanker_base.Clanker_v3_evt_TokenCreated
        WHERE evt_block_time > TIMESTAMP '2024-11-08'
            AND evt_block_time <= from_unixtime(${options.endTimestamp})    
    ),
    dex_trades AS (
        SELECT 
            * 
        FROM 
            dex.trades t
        WHERE 
            t.blockchain = 'base' 
            AND TIME_RANGE
            AND amount_usd > 1
    ),
    daily_fees AS (
        SELECT 
            d_day,
            projects,
            SUM(fees) AS daily_fees 
        FROM (
            SELECT 
                DATE_TRUNC('day', block_time) AS d_day,
                a.tokenAddress,
                a.projects,
                SUM(amount_usd * 0.01) AS fees 
            FROM 
                dex_trades t 
            INNER JOIN 
                created_contracts a 
            ON 
                a.tokenAddress = t.token_bought_address
            GROUP BY 
                1, 2, 3

            UNION ALL

            SELECT 
                DATE_TRUNC('day', block_time) AS d_day,
                a.tokenAddress,
                a.projects,
                SUM(amount_usd * 0.01) AS fees 
            FROM 
                dex_trades t 
            INNER JOIN 
                created_contracts a 
            ON 
                a.tokenAddress = t.token_sold_address
            WHERE 
                t.blockchain = 'base' 
                AND TIME_RANGE
                AND amount_usd > 1
            GROUP BY 
                1, 2, 3
        ) AS combined_fees
        GROUP BY 
            1, 2
    )
    SELECT 
        d_day,
        daily_fees 
    FROM 
        daily_fees
    WHERE 
        d_day <> DATE_TRUNC('day', NOW())
    ORDER BY 
        d_day DESC
      `);
  dailyFees.addUSDValue(res[0].daily_fees);
  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: "2024-11-22",
    },
  },
};

export default adapter;
