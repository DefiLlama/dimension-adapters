import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {

  const data = await queryDuneSql(options, `
    SELECT 
      SUM(amount_usd) AS volume
    FROM dex_solana.trades
    WHERE trade_source = 'T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT'
    AND block_time >= from_unixtime(${options.startTimestamp}) AND block_time < from_unixtime(${options.endTimestamp})
  `);

  return {
    dailyVolume: data[0].volume
  };
};

const adapter: any = {
  version: 1,
  fetch,
  start: '2024-11-06',
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
};

export default adapter;
