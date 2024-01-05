import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { fetchURLWithRetry } from "../../helpers/duneRequest";

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
  async (_: number): Promise<FetchResult> => {
    const unixTimestamp = getUniqStartOfTodayTimestamp();

    try {
      const data = (
        await fetchURLWithRetry(
          `https://api.dune.com/api/v1/query/3325921/results`
        )
      ).data;
      const chainData = data?.result?.rows?.find(
        (row: any) => chainsMap[row.blockchain] === chain
      );

      return {
        dailyVolume: chainData.volume_24h,
        timestamp: unixTimestamp,
      };
    } catch (e) {
      return {
        dailyVolume: "0",
        timestamp: unixTimestamp,
      };
    }
  };

const adapter: any = {
  adapter: {
    ...Object.values(chainsMap).reduce((acc, chain) => {
      return {
        ...acc,
        [(chainsMap as any)[chain] || chain]: {
          fetch: fetch(chain),
          start: async () => 1692897682,
        },
      };
    }, {}),
  },
};

export default adapter;
