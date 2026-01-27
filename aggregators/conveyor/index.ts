import { Dependencies, FetchOptions, FetchResult, SimpleAdapter, } from "../../adapters/types";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const chainsMap: Record<string, string> = {
  ETHEREUM: "ethereum",
  ARBITRUM: "arbitrum",
  POLYGON: "polygon",
  BNB: "bsc",
  OPTIMISM: "optimism",
  BASE: "base",
};

const prefetch = async (options: FetchOptions) => {
  const sql_query = getSqlFromFile('helpers/queries/conveyor.sql', {startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp})
  return await queryDuneSql(options, sql_query);
}

const fetch = async (_a:any, _b:any, options: FetchOptions): Promise<FetchResult> => {
  const results = options.preFetchedResults || [];
  const chainData = results.find(item => chainsMap[item.blockchain] === options.chain.toLowerCase());

  return {
    dailyVolume: chainData?.volume_24h || 0,
  };
}


const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: {
    ...Object.values(chainsMap).reduce((acc, chain) => {
      return {
        ...acc,
        [(chainsMap as any)[chain] || chain]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2023-08-24',
        },
      };
    }, {}),
  },
  prefetch,
  isExpensiveAdapter: true,
};

export default adapter;
