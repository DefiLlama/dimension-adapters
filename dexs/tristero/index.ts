import { SimpleAdapter } from "../../adapters/types";
import { TRISTERO_DEX_CHAINS, fetchDailyVolume } from "../../helpers/tristero";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: async (options) => ({ dailyVolume: await fetchDailyVolume(options) }),
  adapter: TRISTERO_DEX_CHAINS,
  methodology: {
    Volume: "Source token amounts from legacy OrderFilled events. V3 router.send swaps count both maker and filler assets, including delegated execute() batches containing router.send calls. Margin opens include collateral and loan; margin closes include loan settlement transfers.",
  },
};

export default adapter;
