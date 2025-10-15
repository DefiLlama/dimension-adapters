import ADDRESSES from '../helpers/coreAssets.json'
// Decoded Schema: https://github.com/duneanalytics/spellbook/blob/main/dbt_subprojects/solana/models/_sector/dex/pumpdotfun/solana/pumpdotfun_solana_base_trades.sql

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const vol = await queryDuneSql(options, `
    SELECT 
      SUM(
        CASE 
          WHEN token_sold_mint_address = '${ADDRESSES.solana.SOL}' 
          THEN token_sold_amount_raw
          WHEN token_bought_mint_address = '${ADDRESSES.solana.SOL}'
          THEN token_bought_amount_raw
          ELSE 0
        END
      ) / 1e9 as total_sol_volume
    FROM dex_solana.trades
    WHERE project = 'pumpdotfun'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
  `);

  const dailyVolume = options.createBalances()
  dailyVolume.add(ADDRESSES.solana.SOL, vol[0].total_sol_volume*1e9);
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2024-01-14'
    },
  },
  isExpensiveAdapter: true
};

export default adapter;