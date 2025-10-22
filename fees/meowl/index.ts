import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async () => {
        return {
          dailyFees: 0,
          dailyRevenue: 0,
        };
      },
      start: '2023-05-29',
    },
  },
  deadFrom: '2024-05-29',
  version: 2,
  methodology: {
    Fees: "Fees paid by users while using Meowl Discord bot.",
    Revenue: "All fees are revenue.",
  }
}

export default adapter;
