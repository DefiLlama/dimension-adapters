import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";

const chainsMap: Record<string, string> = {
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.BSC]: 'bnb',
  [CHAIN.AVAX]: 'avalanche_c',
  [CHAIN.OPTIMISM]: 'optimism',
  [CHAIN.BASE]: 'base',
  [CHAIN.XDAI]: 'gnosis',
  [CHAIN.LINEA]: 'linea',
  [CHAIN.SONIC]: 'sonic',
  [CHAIN.UNICHAIN]: 'unichain',
  [CHAIN.ERA]: 'zksync',
};

const prefetch = async (options: FetchOptions) => {
  const blacklisted = getDefaultDexTokensBlacklisted(CHAIN.BSC);

  const sql_query = `
    SELECT
      blockchain,
      sum(amount_usd) as volume_24h
    FROM oneinch.swaps
    WHERE
      (protocol = 'AR' OR flags['second_side'])
      AND TIME_RANGE
      AND src_token_address NOT IN (${blacklisted})
      AND dst_token_address NOT IN (${blacklisted})
    GROUP BY 1
    ORDER BY volume_24h DESC
  `;
  const result = await queryDuneSql(options, sql_query);

  return result;
};

const fetch = async (
  _a: any,
  _b: any,
  options: FetchOptions
): Promise<FetchResult> => {
  const results = options.preFetchedResults || [];
  const chainData = results.find((item: any) => item.blockchain === chainsMap[options.chain]);

  return {
    dailyVolume: chainData ? chainData.volume_24h : 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  chains: Object.keys(chainsMap),
  start: "2023-12-05",
  prefetch,
  isExpensiveAdapter: true,
};

export default adapter;
