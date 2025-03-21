import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import axios from "axios";

const sentioApiKey = "s0T3OflD18sDuN6DeSy7XyVsPqHQTbD4z"; //Read Only

const fetchDailyVolume = async ({
  fromTimestamp,
  toTimestamp,
  startOfDay,
}: FetchOptions) => {
  const url =
    "https://app.sentio.xyz/api/v1/analytics/navi/dex-aggregator/sql/execute";
  const res = await axios(url, {
    method: "POST",
    headers: {
      "api-key": sentioApiKey,
      "Content-Type": "application/json",
    },
    data: JSON.stringify({
      sqlQuery: {
        sql: `SELECT SUM(GREATEST(amount_in_usd, amount_out_usd)) AS usdValue
              FROM 'swapEvent'
              WHERE timestamp >= ${fromTimestamp} AND timestamp <= ${toTimestamp};`,
      }
    }),
  }).then((response) => response.data);

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
