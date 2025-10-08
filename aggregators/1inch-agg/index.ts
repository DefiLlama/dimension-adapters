import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";

const chainsMap: Record<string, string> = {
  ETHEREUM: CHAIN.ETHEREUM,
  ARBITRUM: CHAIN.ARBITRUM,
  POLYGON: CHAIN.POLYGON,
  BNB: CHAIN.BSC,
  AVALANCHE: CHAIN.AVAX,
  OPTIMISM: CHAIN.OPTIMISM,
  BASE: CHAIN.BASE,
  GNOSIS: CHAIN.XDAI,
  // FANTOM: CHAIN.FANTOM,
  LINEA: CHAIN.LINEA,
  SONIC: CHAIN.SONIC,
  UNICHAIN: CHAIN.UNICHAIN,
  ZKSYNC: CHAIN.ZKSYNC,
};

const prefetch = async (options: FetchOptions) => {
  const sql_query = `
    SELECT
        split_part(upper(blockchain), '_', 1) as blockchain,
        sum(amount_usd) as volume_24h
    FROM oneinch.swaps
    WHERE
        (protocol = 'AR' OR flags['second_side'])
        AND TIME_RANGE
    GROUP BY 1
    ORDER BY volume_24h DESC
  `;
  return await queryDuneSql(options, sql_query);
};

const fetch = async (
  _a: any,
  _b: any,
  options: FetchOptions
): Promise<FetchResult> => {
  const results = options.preFetchedResults || [];
  const chainData = results.find(
    (item: any) => chainsMap[item.blockchain] === options.chain.toLowerCase()
  );

  return {
    dailyVolume: chainData.volume_24h,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: {
    ...Object.values(chainsMap).reduce((acc, chain) => {
      return {
        ...acc,
        [(chainsMap as any)[chain] || chain]: {
          fetch: fetch,
          start: "2023-12-05",
        },
      };
    }, {}),
  },
  prefetch,
  isExpensiveAdapter: true,
};

export default adapter;
