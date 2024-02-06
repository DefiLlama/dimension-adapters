import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { fetchURLWithRetry } from "../../helpers/duneRequest";

const chainsMap: Record<string, string> = {
  ethereum: "ethereum",
};

const fetch =
  () =>
  async (timestamp: number): Promise<FetchResult> => {
    const unixTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );

    try {
      const data = (
        await fetchURLWithRetry(
          "https://api.dune.com/api/v1/query/3321375/results"
        )
      ).data;
      const chainData = data?.result?.rows.find(
        ({ aggregate_by }: { aggregate_by: string }) =>
          getUniqStartOfTodayTimestamp(new Date(aggregate_by)) === unixTimestamp
      );

      return {
        dailyVolume: chainData?.volume ?? "0",
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
          fetch: fetch(),
          runAtCurrTime: true,
          start: async () => 1639526400,
        },
      };
    }, {}),
  },
};

export default adapter;
