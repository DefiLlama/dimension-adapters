import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API = "https://api.sparkdex.ai/perps/v2/trading-stats/daily";
const DAY = 86400;

const fetch = async (options: FetchOptions) => {
  const res = await fetchURL(
    `${API}?from=${options.startOfDay}&to=${options.endTimestamp + DAY}&format=open_interest&chainId=14&dex=SparkDEX`
  );

  const item = res.data.find((stat: any) => stat.timestamp === options.endTimestamp);
  if (!item) throw new Error(`No SparkDEX OI data for ${options.endTimestamp}`);

  return {
    openInterestAtEnd: item.openInterest,
    longOpenInterestAtEnd: item.longOpenInterest,
    shortOpenInterestAtEnd: item.shortOpenInterest,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.FLARE],
  start: "2025-10-16",
};

export default adapter;
