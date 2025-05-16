import { FetchOptions, FetchResult, } from "../../adapters/types";
import { queryDune } from "../../helpers/dune";
let _data: any = {}

const chainsMap: Record<string, string> = {
  ETHEREUM: "ethereum",
  ARBITRUM: "arbitrum",
  POLYGON: "polygon",
  BNB: "bsc",
  OPTIMISM: "optimism",
  BASE: "base",
};

const fetch =
  (chain: string) =>
    async ({ startOfDay }: FetchOptions): Promise<FetchResult> => {
      if (!_data[startOfDay]) _data[startOfDay] = queryDune(`3325921`, {})
      const data = await _data[startOfDay]

      const chainData = data.find((row: any) => chainsMap[row.blockchain] === chain);

      return {
        dailyVolume: chainData.volume_24h,
      };
    };

const adapter: any = {
  adapter: {
    ...Object.values(chainsMap).reduce((acc, chain) => {
      return {
        ...acc,
        [(chainsMap as any)[chain] || chain]: {
          fetch: fetch(chain),
          runAtCurrTime: true,
          start: '2023-08-24',
        },
      };
    }, {}),
  },
  isExpensiveAdapter: true,
};

export default adapter;
