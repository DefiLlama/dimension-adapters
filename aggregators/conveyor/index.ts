import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { fetchURLWithRetry } from "../../helpers/duneRequest";

const chains: Record<string, string> = {
  ethereum: "ethereum",
  bnb: "bsc",
  polygon: "polygon",
};

const fetch = (chain: string) => async (timestamp: number) => {
  const timestampDate = new Date(timestamp * 1000);
  const unixTimestamp = getUniqStartOfTodayTimestamp(timestampDate);
  const data = (
    await fetchURLWithRetry("https://api.dune.com/api/v1/query/3319718/results")
  ).data.result.rows;
  const dayData = data.find(
    ({ block_date, blockchain }: { block_date: number; blockchain: string }) =>
      getUniqStartOfTodayTimestamp(new Date(block_date)) === unixTimestamp &&
      blockchain === chain
  );

  return {
    dailyVolume: dayData?.trade_amount,
    timestamp: unixTimestamp,
  };
};

const adapter: any = {
  adapter: {
    ...Object.entries(chains).reduce((acc, [key, chain]) => {
      return {
        ...acc,
        [chain]: {
          fetch: fetch(key),
          start: async () => new Date(2023, 6, 1).getTime() / 1000,
        },
      };
    }, {}),
  },
};

export default adapter;
