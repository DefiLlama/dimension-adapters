import { Adapter, FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

type TEndpoint = {
  [s: string]: string;
};

const endpoints: TEndpoint = {
  ["massa"]: "https://mainnet.api.eaglefi.io/statistics/volume",
};

const fetch = async (options: FetchOptions) => {
  const volume24H = await fetchURL(
    `${endpoints["massa"]}?start=${options.startTimestamp}&end=${options.endTimestamp}`
  );

  return {
    dailyVolume: volume24H.volume,
    dailyFees: volume24H.fees,
  };
};

const adapter: Adapter = {
  version: 2,
  methodology: {
    Volume: 'Trading volume get from EagleFi API.',
    Fees: 'Trading fees get from EagleFi API.',
  },
  fetch,
  chains: ['massa'],
  start: "2025-06-23",
};

export default adapter;
