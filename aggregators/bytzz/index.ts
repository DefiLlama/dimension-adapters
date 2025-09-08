import fetchURL from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const fetch = async (timestamp: number) => {
  const unixTimestamp = getUniqStartOfTodayTimestamp(
    new Date(timestamp * 1000)
  );

  const data = await fetchURL(
    `https://bytzz.xyz/api/stats?timestamp=${unixTimestamp}`
  );

  return {
    dailyVolume: data?.volume24h || 0,
    totalVolume: data?.cumulativeVolume || 0,
    timestamp: unixTimestamp,
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