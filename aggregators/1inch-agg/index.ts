import { FetchResult, } from "../../adapters/types";
import { fetchURLWithRetry } from "../../helpers/duneRequest";

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

const fetch =
  (chain: string) =>
    async (): Promise<FetchResult> => {
      const data = await fetchURLWithRetry(`https://api.dune.com/api/v1/query/1736855/results`)
      const chainData = data.result.rows.find(
        (row: any) => chainsMap[row.blockchain] === chain
      );
      if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`)
      return {
        dailyVolume: chainData.volume_24h,
      };
    };

const adapter: any = {
  timetravel: false,
  version: 2,
  adapter: {
    ...Object.values(chainsMap).reduce((acc, chain) => {
      return {
        ...acc,
        [(chainsMap as any)[chain] || chain]: {
          fetch: fetch(chain),
          runAtCurrTime: true,
          start: '2023-12-05',
        },
      };
    }, {}),
  },
  isExpensiveAdapter: true,
};

export default adapter;
