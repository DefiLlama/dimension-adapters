import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetch from "node-fetch";

const url = 'https://app.sentio.xyz/api/v1/analytics/zhpv96/spark-processor/sql/execute';
const apiKey = 'TLjw41s3DYbWALbwmvwLDM9vbVEDrD9BP';
const data = {
  "sqlQuery": {
    "sql": "SELECT tradeVolume, timestamp FROM `DailyVolume` ORDER BY `timestamp` DESC LIMIT 1"
  }
};

const fetchTradeVolume = () =>
  fetch(url, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then((result) => {
      const rows = result.result?.rows || [];

      if (rows.length === 0) {
        console.warn('No trade volume data available.');
        return {
          totalVolume: null,
          timestamp: null,
        };
      }

      const totalVolume = rows[0]?.tradeVolume;
      const timestamp = rows[0]?.timestamp;

      return {
        dailyVolume: totalVolume,
        timestamp: timestamp,
      };
    });

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.FUEL]: {
      fetch: fetchTradeVolume,
      start: 1601424000,
    },
  },
};

export default adapters;
