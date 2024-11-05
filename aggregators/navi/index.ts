import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";

const sentioApiKey = '3taTsrTS3cZq4tcKkKVSajWSJxkjZmcet'; //Read Only

const fetchDailyVolume = async (options: FetchOptions) => {
  const url = 'https://app.sentio.xyz/api/v1/analytics/navi/dex-aggregator/sql/execute';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': sentioApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sqlQuery: {
        sql: `SELECT SUM(GREATEST(amount_in_usd, amount_out_usd)) AS usdValue
              FROM \`swapEvent\`
              WHERE timestamp >= ${options.startOfDay} AND timestamp <= ${options.endTimestamp};`
      },
      version: 15
    })
  }).then(response => response.json());

  return {
    dailyVolume: res.result.rows[0].usdValue,
  }

};

//NAVI Aggregator Volume
const navi_aggregator: any = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchDailyVolume,
      start: 1728111600,
    },
  },
};

export default navi_aggregator;