import { FetchResult, } from "../../adapters/types";
import fetchUrl from "../../utils/fetchURL"
import { getTimestampAtStartOfDayUTC } from "../../utils/date"
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { fetchURLWithRetry } from "../../helpers/duneRequest";

const chainsMap: Record<string, string> = {
  ETHEREUM: "ethereum",
  ARBITRUM: "arbitrum",
  POLYGON: "polygon",
  BNB: "bnb",
  AVALANCHE: "avalanche_c",
  OPTIMISM: "optimism",
  BASE: "base"
};

const fetch =
  (chain: string) =>
    async (timestamp: number): Promise<FetchResult> => {
      const unixTimestamp1 = getTimestampAtStartOfDayUTC(timestamp)
      const unixTimestamp2 = getUniqStartOfTodayTimestamp();
      if (unixTimestamp1 < unixTimestamp2) {
        const url = `https://script.google.com/macros/s/AKfycbxqWlzQQzpG-KVGVpVLPafPljYkXejEAJ7TpQc8iBaHuvvu5jx5BnRFYEfQu0pqK5j_-Q/exec?timestamp=${timestamp.toString()}`
        const data = await fetchUrl(url)
        const chainData = data.result.rows.find(
          (row: any) => chainsMap[row.chain] === chain
        );
        return {
          dailyVolume: chainData.dailyVolume,
          timestamp: unixTimestamp1,
        };
      } else {
        const url = `https://api.dune.com/api/v1/query/3587739/results?api_key=eyZHAcPUFcAFvMk5sVysebYKeyrp9CK0`
        const data = await fetchUrl(url)
        const chainData = data.result.rows.find(
          (row: any) => chainsMap[row.chain] === chain
        );
        return {
          dailyVolume: chainData.dailyVolume,
          timestamp: unixTimestamp2,
        };
      }
    };

const adapter: any = {
  timetravel: false,
  adapter: {
    ...Object.values(chainsMap).reduce((acc, chain) => {
      return {
        ...acc,
        [(chainsMap as any)[chain] || chain]: {
          fetch: fetch(chain),
          start: 1662595200,
        },
      };
    }, {}),
  },
  isExpensiveAdapter: true,
};

export default adapter;
