import type { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: SimpleAdapter = {
  chains: [CHAIN.NEAR],
  fetch: async (_: any) => {return {}},
  deadFrom: '2026-06-06',
};

export default adapter;
