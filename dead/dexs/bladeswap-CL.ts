import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BLAST]: {
      fetch: () => ({} as any),
      deadFrom: "2025-03-21",
    }
  }
}

export default adapter;
