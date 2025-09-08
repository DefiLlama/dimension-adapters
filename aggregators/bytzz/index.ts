import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const fetch = async (_:any, _1:any, { startOfDay }: FetchOptions) => {
  const data = await fetchURL(
    `https://bytzz.xyz/api/stats?timestamp=${startOfDay}`
  );
  if (!data) throw new Error("No data");

  return {
    dailyVolume: data?.volume24h,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  start: "2025-08-26",
  methodology: {
    Volume: "Volume from Bytzz",
  },
  chains: [CHAIN.XLAYER],
};

export default adapter;