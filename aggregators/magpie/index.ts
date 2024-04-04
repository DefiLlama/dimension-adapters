import { FetchResult, } from "../../adapters/types";
import fetchUrl from "../../utils/fetchURL"
import { getTimestampAtStartOfDayUTC } from "../../utils/date"
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const chainsMap: Record<string, string> = {
  ETHEREUM: "ETHEREUM",
  ARBITRUM: "ARBITRUM",
  POLYGON: "POLYGON",
  AVALANCHE: "AVALANCHE",
  BNB: "BNB",
  OPTIMISM: "OPTIMISM",
  BASE: "BASE"
};



const fetch =
  (chain: string) =>
    async (timestamp: number): Promise<FetchResult> => {
      const unixTimestamp1 = getTimestampAtStartOfDayUTC(timestamp)
      const unixTimestamp2 = getUniqStartOfTodayTimestamp();
      console.log(chain, timestamp, unixTimestamp1, unixTimestamp2)
      if (unixTimestamp1 < unixTimestamp2) {
        // console.log("Method 1")
        const url = `https://script.google.com/macros/s/AKfycbxqWlzQQzpG-KVGVpVLPafPljYkXejEAJ7TpQc8iBaHuvvu5jx5BnRFYEfQu0pqK5j_-Q/exec?timestamp=${unixTimestamp1.toString()}`
        const data = await fetchUrl(url, 10)
    
        const chainData = data.result.rows.find(
          (row: any) => chainsMap[row.chain] === chain
        );
        if (chainData === undefined ) {
          return {
            dailyVolume: 0,
            timestamp: unixTimestamp2,
          };
        } else {
        return {
          dailyVolume: chainData.dailyVolume,
          timestamp: unixTimestamp2,
        };
      }
      } else {
        // console.log("Method 2")
        const url = `https://api.dune.com/api/v1/query/3587739/results?api_key=eyZHAcPUFcAFvMk5sVysebYKeyrp9CK0`
        const data = await fetchUrl(url, 10)
        const chainData = data.result.rows.find(
          (row: any) => chainsMap[row.chain] === chain
        );
        if (chainData === undefined ) {
          return {
            dailyVolume: 0,
            timestamp: unixTimestamp2,
          };
        } else {
        return {
          dailyVolume: chainData.dailyVolume,
          timestamp: unixTimestamp2,
        };
      }
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
