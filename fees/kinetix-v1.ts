import { CHAIN } from "../helpers/chains";
import { Adapter } from "../adapters/types";

// Original used gmxV1Exports with vault: "0xa721f9f61CECf902B2BCBDDbd83E71c191dEcd8b"

const adapter: Adapter = {
  version: 2,
  deadFrom: "2025-08-19", // Kinetix Perpetuals V1 & V2 officially terminated
  adapter: {
    [CHAIN.KAVA]: {
      fetch: async () => ({}),
      start: "2023-12-12",
    },
  },
};

export default adapter;
