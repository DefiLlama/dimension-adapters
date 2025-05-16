import { FetchOptions, FetchResult, } from "../../adapters/types";
import { queryDune } from "../../helpers/dune";

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
let _data: any = {}

const fetch = async ({ startOfDay, chain, }: FetchOptions): Promise<FetchResult> => {
  if (!_data[startOfDay]) _data[startOfDay] = queryDune(`1736855`, {})
  const data = await _data[startOfDay]
  const chainData = data.find((row: any) => chainsMap[row.blockchain] === chain);
  if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`)
  return {
    dailyVolume: chainData.volume_24h,
  };
}

const adapter: any = {
  timetravel: false,
  version: 2,
  adapter: {
    ...Object.values(chainsMap).reduce((acc, chain) => {
      return {
        ...acc,
        [(chainsMap as any)[chain] || chain]: {
          fetch,
          runAtCurrTime: true,
          start: '2023-12-05',
        },
      };
    }, {}),
  },
  isExpensiveAdapter: true,
};

export default adapter;
