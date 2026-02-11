import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql, getSqlFromFile } from "../helpers/dune";

const prefetch = async (options: FetchOptions) => {
  const results = await queryDuneSql(
    options,
    getSqlFromFile("helpers/queries/exa-card.sql"),
  );
  return results;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const results = options.preFetchedResults;
  
  const result = results.find((r: any) => r.chain === options.chain);

  return { dailyVolume: result ? result.total_volume : 0 };
};

const adapter: SimpleAdapter = {
  fetch,
  prefetch,
  start: "2024-07-01",
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.BASE, CHAIN.OPTIMISM],
};

export default adapter;
