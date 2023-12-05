import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

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

    try {
      const data = (
        await fetchURL(
          `https://api.dune.com/api/v1/query/1736855/results?api_key=R0n7PWCs1hw6O6nvQrmJPGTIUZKKn2zz`
        )
      ).data;
      const chainData = data?.result?.rows?.find(
        (row: any) => chainsMap[row.blockchain] === chain
      );

      console.log({
        dailyVolume: chainData.volume_24h,
        timestamp: unixTimestamp,
      });

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
          start: async () => 1701734400,
        },
      };
    }, {}),
  },
};

export default adapter;
