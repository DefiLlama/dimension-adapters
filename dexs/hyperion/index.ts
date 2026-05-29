import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraph/utils";
import fetchURL from "../../utils/fetchURL";

const BASE_URL =
  "https://api.hyperion.xyz/base/data/public/defillama/volume-fee-stat";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const { dailyVolume, dailyFees } = await fetchURL(
    `${BASE_URL}?timestamp=${dayTimestamp}`,
  );
  const dailyRevenue = Number(dailyFees) * 0.2;

  return {
    dailyFees,
    dailyRevenue,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "Total Fee user pays for the trades",
    Revenue: "Revenue is calculated as 0.2% of the daily fees",
  },
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: "2025-02-04",
    },
  },
};

export default adapter;
