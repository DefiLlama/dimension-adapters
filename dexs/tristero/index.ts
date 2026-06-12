import { SimpleAdapter } from "../../adapters/types";
import { TRISTERO_DEX_CHAINS, fetchDailyVolume } from "../../helpers/tristero";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: async (options) => ({ dailyVolume: await fetchDailyVolume(options) }),
  adapter: TRISTERO_DEX_CHAINS,
  methodology: {
    Volume: "Legacy Tristero volume is counted from OrderFilled source token amounts. V3 volume is counted from on-chain router.send transactions for TAKER, CROSS, and MARGIN orders plus escrow.close settlement transfers; margin opens include collateral plus decoded loan quantity.",
  },
};

export default adapter;
