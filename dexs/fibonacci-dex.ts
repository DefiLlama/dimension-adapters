import { CHAIN } from "../helpers/chains";
import { Adapter } from "../adapters/types";

const adapters: Adapter = {
  deadFrom: "2025-08-15", // Form Network has been sunsetted and Fibonacci Dex no longer exists
  adapter: {
    [CHAIN.FORMNETWORK]: {
      fetch: async () => ({
        dailyVolume: 0,
        dailyFees: 0,
      }),
      start: "2024-10-29",
    },
  },
};

export default adapters;
