import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetch from "node-fetch";

const url = 'https://app.sentio.xyz/api/v1/analytics/zhpv96/spark-processor/sql/execute';
const apiKey = 'TLjw41s3DYbWALbwmvwLDM9vbVEDrD9BP';

const fetchTradeVolume = ({ startTimestamp, endTimestamp }: FetchOptions) =>
  fetch(url, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      "sqlQuery": {
        "sql": `SELECT tradeVolume, timestamp FROM DailyVolume WHERE timestamp >= ${startTimestamp} AND timestamp <= ${endTimestamp} ORDER BY timestamp DESC LIMIT 1`
      }
    }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then((result) => {
      const rows = result.result?.rows || [];
      rows.forEach((row: any) => row.date = new Date(row.timestamp * 1000).toISOString());

      if (rows.length === 0)
        throw new Error('No trade volume data available.');

      const dailyVolume = rows[0]?.tradeVolume;

      return {
        dailyVolume,
      };
    });

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FUEL]: {
      fetch: fetchTradeVolume,
      start: "2024-11-06",
    },
  },
};

export default adapters;
