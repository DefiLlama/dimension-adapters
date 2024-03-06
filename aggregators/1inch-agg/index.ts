import { FetchResult, } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
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
    async (_: number): Promise<FetchResult> => {
      const unixTimestamp = getUniqStartOfTodayTimestamp();
      const data = await fetchURLWithRetry(`https://api.dune.com/api/v1/query/1736855/results`)
      const chainData = data.result.rows.find(
        (row: any) => chainsMap[row.blockchain] === chain
      );

      return {
        dailyVolume: chainData.volume_24h,
        timestamp: unixTimestamp,
      };
    };

const adapter: any = {
  timetravel: false,
  adapter: {
    ...Object.values(chainsMap).reduce((acc, chain) => {
      return {
        ...acc,
        [(chainsMap as any)[chain] || chain]: {
          fetch: fetch(chain),
          runAtCurrTime: true,
          start: 1701734400,
        },
      };
    }, {}),
  },
  isExpensiveAdapter: true,
};

export default adapter;
