import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startOfDay = options.startOfDay;
  const dateStr = new Date(startOfDay * 1000).toISOString().split('T')[0];

  const data = await httpGet("https://parcl-api.com/v1/time-series/cumulative-lp-fee?window=y", {
    headers: {
      "origin": "https://app.parcl.co",
      "referer": "https://app.parcl.co/",
    }
  });

  let dailyFees = 0;
  const dayData = data.timeSeries.find((item: any) => item.date.startsWith(dateStr));
  if (!dayData) {
    console.log(`No data found for date ${dateStr}`);
  }else {
    dailyFees = dayData.value;
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.SOLANA],
  fetch,
  start: '2024-06-01',
  methodology: {
    Fees: "LP fees collected by Parcl protocol",
    Revenue: "LP fees collected by the protocol",
    ProtocolRevenue: "100% of collected fees go to the protocol",
  },
};

export default adapter;
