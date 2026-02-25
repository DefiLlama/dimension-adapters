import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.KAVA]: {
      fetch: () => ({} as any),
      start: '2022-06-30',
      deadFrom: "2025-03-19",
    },
  }
}

export default adapter;
