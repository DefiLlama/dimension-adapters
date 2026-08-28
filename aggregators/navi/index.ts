import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { httpPost } from "../../utils/fetchURL";

const sentioApiKey = "l3ruhon4MonUTvfCHMYVGsK6Axp0KyjMM"; //Read Only
const API_URL =
  "https://app.sentio.xyz/api/v1/analytics/navi/astros/sql/execute";

const HEADERS = {
  "api-key": sentioApiKey,
  "Content-Type": "application/json",
};

// we need to resync the history data of this aggregator
const fetchDailyVolume = async (options: FetchOptions) => {
  const res = await httpPost(
    API_URL,
    JSON.stringify({
      sqlQuery: {
        sql: `SELECT SUM(GREATEST(amount_in_usd, amount_out_usd)) AS usdValue
            FROM 'swapEvent'
            WHERE timestamp >= ${options.fromTimestamp} AND timestamp <= ${options.toTimestamp};`,
      },
    }),
    {
      headers: HEADERS,
    }
  );

  return {
    dailyVolume: res.result.rows[0].usdValue,
  };
};

//NAVI Aggregator Volume
const navi_aggregator: any = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchDailyVolume,
      start: "2024-10-05",
    },
  },
};

export default navi_aggregator;
