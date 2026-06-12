import { SimpleAdapter } from "../../adapters/types";
import { TRISTERO_DEX_CHAINS, fetchDailyVolume } from "../../helpers/tristero";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: async (options) => ({ dailyVolume: await fetchDailyVolume(options) }),
  adapter: TRISTERO_DEX_CHAINS,
  methodology: {
    Volume: "Source-side token amounts from legacy OrderFilled events and v3 router.send orders. Margin opens include collateral and loan; margin closes include loan settlement transfers.",
  },
};

export default adapter;
