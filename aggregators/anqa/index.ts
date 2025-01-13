import {FetchResult,} from "../../adapters/types";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";
import {fetchURLWithRetry} from "../../helpers/duneRequest";

const fetch = async (_: number): Promise<FetchResult> => {
    const unixTimestamp = getUniqStartOfTodayTimestamp();
    const data = await fetchURLWithRetry(`https://api.dune.com/api/v1/query/3835933/results`)
    const chainData = data.result.rows[0];
    if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`)
    return {
      dailyVolume: chainData["Volume 24h"],
      totalVolume: chainData["Total Volume"],
      timestamp: unixTimestamp,
    };
  };

const adapter: any = {
  timetravel: false,
  adapter: {
    "aptos": {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2023-06-16',
    }
  },
  isExpensiveAdapter: true,
};

export default adapter;
