import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const BASE_URL =
  "https://api.hyperion.xyz/base/data/public/defillama/volume-fee-stat";

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyFees } = await fetchURL(
    `${BASE_URL}?timestamp=${options.startOfDay}`,
  );
  const dailyRevenue = Number(dailyFees) * 0.2;

  return {
    dailyFees,
    dailyRevenue,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.APTOS],
  start: "2025-02-04",
  methodology: {
    Fees: "Total Fee user pays for the trades",
    Revenue: "Revenue is calculated as 0.2% of the daily fees",
  },
};

export default adapter;
