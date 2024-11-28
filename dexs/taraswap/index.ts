import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume } from "./logic";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TARAXA]: {
      fetch: fetchVolume,
      start: "2025-11-10",
    },
  },
};

export default adapter;
