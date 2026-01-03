import { FetchOptions, SimpleAdapter, Dependencies } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (_: any, _b: any, options: FetchOptions) => {
  let openInterestAtEnd = 0;
// https://dune.com/queries/3343122/5601864
  const query = `
    SELECT SUM(amount) AS value FROM (      
      SELECT 
        balance AS amount
      FROM tokens_polygon.balances_daily
      WHERE token_address = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
        AND address IN (
          0x4D97DCd97eC945f40cF65F87097ACe5EA0476045,
          0x3A3BD7bb9528E159577F7C2e685CC81A765002E2
        )
        AND day >= from_unixtime(${options.startTimestamp})
        AND day < from_unixtime(${options.endTimestamp})

      UNION ALL

      SELECT 
        amount AS amount
      FROM balances_polygon.erc20_day
      WHERE token_address = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
        AND wallet_address IN (
          0x4D97DCd97eC945f40cF65F87097ACe5EA0476045,
          0x3A3BD7bb9528E159577F7C2e685CC81A765002E2
        )
        AND block_day >= from_unixtime(${options.startTimestamp})
        AND block_day < from_unixtime(${options.endTimestamp})
    )
  `;

  const res = await queryDuneSql(options, query);

  if (res.length && res[0].value) {
    openInterestAtEnd = Math.abs(Number(res[0].value));
  }

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.POLYGON],
  start: "2022-01-01",
  dependencies: [Dependencies.DUNE],
};

export default adapter;