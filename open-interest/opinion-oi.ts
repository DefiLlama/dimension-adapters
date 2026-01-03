import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const { createBalances } = options;
  
  const result = await queryDuneSql(options, `
    WITH
    opinion_raw AS (
        SELECT 
            DATE_TRUNC('day', evt_block_time) AS day,
            SUM(value / 1e18) AS amount
        FROM erc20_bnb.evt_transfer
        WHERE "to" = 0xad1a38cec043e70e83a3ec30443db285ed10d774
          AND contract_address = 0x55d398326f99059fF775485246999027B3197955
          AND evt_block_number >= 64726315
        GROUP BY 1
        
        UNION ALL
        
        SELECT 
            DATE_TRUNC('day', evt_block_time) AS day,
            -SUM(value / 1e18) AS amount
        FROM erc20_bnb.evt_transfer
        WHERE "from" = 0xad1a38cec043e70e83a3ec30443db285ed10d774
          AND contract_address = 0x55d398326f99059fF775485246999027B3197955
          AND evt_block_number >= 64726315
        GROUP BY 1
    ),
    opinion AS (
        SELECT 
            day,
            SUM(amount) AS tvl_delta,
            SUM(SUM(amount)) OVER (ORDER BY day) AS value
        FROM opinion_raw
        GROUP BY 1
    )
    SELECT 
        value
    FROM opinion
    WHERE day = from_unixtime(${options.endTimestamp})
    ORDER BY day DESC
    LIMIT 1
  `);

  const balances = createBalances();
  const oiValue = result[0]?.value || 0;
  
  balances.add('bsc:0x55d398326f99059fF775485246999027B3197955', oiValue * 1e18);

  return {
    openInterestAtEnd: balances,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch,
      start: '2025-10-16',
    },
  },
  isExpensiveAdapter: true, 
};

export default adapter;
