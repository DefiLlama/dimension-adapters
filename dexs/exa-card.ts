import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql, getSqlFromFile } from "../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const results = await queryDuneSql(options, getSqlFromFile('helpers/queries/exa-card.sql'))
  
  const result = results.find((r: any) => r.chain === options.chain);
  
  if (!result) {
    throw Error(`Failed to query dune data for ready-card, please check the query and fix it`);
  }

  return { dailyVolume: result.total_volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: '2024-07-01',
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.BASE, CHAIN.OPTIMISM],
};

export default adapter;