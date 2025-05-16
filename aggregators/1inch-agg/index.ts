import { FetchOptions, FetchResult, SimpleAdapter, } from "../../adapters/types";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const chainsMap: Record<string, string> = {
  ETHEREUM: "ethereum",
  ARBITRUM: "arbitrum",
  POLYGON: "polygon",
  BNB: "bsc",
  AVALANCHE: "avax",
  OPTIMISM: "optimism",
  BASE: "base",
  GNOSIS: "xdai",
  FANTOM: "fantom",
};

const prefetch = async (options: FetchOptions) => {
  const sql_query = getSqlFromFile('helpers/queries/1inch_agg.sql', {})
  return await queryDuneSql(options, sql_query);
}

const fetch = async (_a:any, _b:any, options: FetchOptions): Promise<FetchResult> => {
  const results = options.preFetchedResults || [];
  const chainData = results.find(item => chainsMap[item.blockchain] === options.chain.toLowerCase());

  return {
    dailyVolume: chainData.volume_24h,
  };
}


const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    ...Object.values(chainsMap).reduce((acc, chain) => {
      return {
        ...acc,
        [(chainsMap as any)[chain] || chain]: {
          fetch: fetch,
          start: '2023-12-05',
        },
      };
    }, {}),
  },
  prefetch,
  isExpensiveAdapter: true,
};

export default adapter;
