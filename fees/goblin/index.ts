import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const BASE_URL =
  "https://api.hyperion.xyz/base/data/public/defillama/vaults-fee-stat";

const fetch = async ({ startOfDay }: FetchOptions) => {
  // Goblin takes 50% from performance and management fees
  // remain 50% are distributed to goAPT staking - supply side revenue
  const { dailyFees } = await fetchURL(`${BASE_URL}?timestamp=${startOfDay}`);
  const dailyFeesNumber = Number(dailyFees);
  const dailyRevenue = dailyFeesNumber * 0.5;
  const dailySupplySideRevenue = dailyFeesNumber - dailyRevenue;

  return {
    dailyFees: dailyFeesNumber,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.APTOS],
  start: "2026-01-12",
  methodology: {
    Fees: "Performance fees charged from all vaults.",
    Revenue: "Goblin gets 50% fees as revenue.",
    ProtocolRevenue: "Goblin gets 50% fees as revenue.",
    SupplySideRevenue:
      "Goblin distribute 50% fees to goAPT staking for additional yields.",
  },
};

export default adapter;
