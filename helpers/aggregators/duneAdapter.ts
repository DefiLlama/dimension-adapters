import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { fetchURLWithRetry } from "../duneRequest";

const getAdapter = (
  chains: Array<string>,
  chainMap: Record<string, string>,
  name: string,
  start: number
) => {
  const fetch = (chain: string) => async (timestamp: number) => {
    const unixTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );

    const data = await (
      await fetchURLWithRetry(
        "https://api.dune.com/api/v1/query/3321376/results"
      )
    ).result?.rows;

    const dayData = data.find(
      ({
        block_date,
        blockchain,
        project,
      }: {
        block_date: number;
        blockchain: string;
        project: string;
      }) =>
        getUniqStartOfTodayTimestamp(new Date(block_date)) ===
        unixTimestamp &&
        blockchain === (chainMap[chain] || chain) &&
        project === name
    );

    return {
      dailyVolume: dayData?.trade_amount ?? "0",
      timestamp: unixTimestamp,
    };
  };

  const adapter: any = {
    adapter: {
      ...chains.reduce((acc, chain) => {
        return {
          ...acc,
          [chain]: {
            fetch: fetch(chain),
            runAtCurrTime: true,
            start,
          },
        };
      }, {}),
    },
  };

  return adapter;
};

export { getAdapter };
