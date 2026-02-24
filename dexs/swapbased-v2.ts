import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: async (_a: any, _b: any, options: any) =>
        getUniV2LogAdapter({
          factory: "0x04C9f118d21e8B767D2e50C946f0cC9F6C367300",
        })(options),
      start: "2023-07-28",
    },
  },
  methodology: {
    UserFees: "User pays 0.30% fees on each swap.",
    SupplySideRevenue: "LPs receive 0.25% of each swap.",
    ProtocolRevenue: "Treasury receives 0.05% of each swap.",
    Revenue: "All revenue generated comes from user fees.",
    Fees: "All fees comes from the user.",
  },
};

export default adapter;
