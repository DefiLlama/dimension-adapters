import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const duneQuery = `
    SELECT
      sum(CAST(volume_amount_usd AS DOUBLE)) AS daily_volume
    FROM
      dune.near.dataset_near_intents_metrics
    WHERE
      date_at = '${options.dateString}'
  `;
  const queryResult = await queryDuneSql(options, duneQuery);

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(queryResult[0].daily_volume);

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.NEAR],
  start: "2024-11-05",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
