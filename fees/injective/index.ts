import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

interface IResponse {
  exchange_fees_usd: number;
  gas_fees: number;
  total_fees_usd: number;
}

const fetchFees = async (
  timestamp: number,
  _t: ChainBlocks,
  options: FetchOptions
) => {
  const dateStr = new Date(options.startOfDay * 1000)
    .toISOString()
    .split("T")[0];
  const url = `https://bigquery-api-636134865280.europe-west1.run.app/fees?start_date=${dateStr}`;
  const res: IResponse = await httpGet(url);

  const totalDailyFees = res.total_fees_usd;

  return {
    dailyFees: totalDailyFees,
    dailyRevenue: totalDailyFees,
    dailyHoldersRevenue: totalDailyFees,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    injective: {
      fetch: fetchFees,
      start: "2021-07-16",
    },
  },
};

export default adapter;
