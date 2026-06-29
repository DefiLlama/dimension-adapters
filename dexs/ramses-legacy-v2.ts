import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { breakdownMethodology, createFetchHandler, methodology } from "./ramses-cl-v2";

const fetch = createFetchHandler('legacy');

const adapter: SimpleAdapter = {
  methodology,
  breakdownMethodology,
  fetch,
  adapter: {
    [CHAIN.HYPERLIQUID]: { start: '2025-11-08' },
    [CHAIN.ARBITRUM]: { start: '2026-01-28' },
    [CHAIN.POLYGON]: { start: '2026-01-28' },
  },
};

export default adapter;
