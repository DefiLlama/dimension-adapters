import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const results = await queryDuneSql(
    options,
    getSqlFromFile("helpers/queries/bitget-wallet-card.sql"),
  );
  
  if (!results[0]) {
    throw Error(`Failed to query dune data for bitget-wallet-card, please check the query and fix it`);
  }

  return { dailyVolume: results[0].total_volume };
};

const adapter: SimpleAdapter = {
  fetch,
  start: '2025-01-21',
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.ARBITRUM],
};

export default adapter;