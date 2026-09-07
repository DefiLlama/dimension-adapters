import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { breakdownMethodology, createFetchHandler, methodology } from "./ramses-cl-v2";

const fetch = createFetchHandler('legacy');

const adapter: SimpleAdapter = {
  version: 2,
  // Delayed Sarcophagus funding can exceed protocol revenue accrued in the current window.
  allowNegativeValue: true,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  fetch,
  adapter: {
    [CHAIN.HYPERLIQUID]: { start: '2025-11-08' },
    [CHAIN.ARBITRUM]: { start: '2026-01-28' },
    [CHAIN.POLYGON]: { start: '2026-01-28' },
    [CHAIN.ROBINHOOD]: { start: '2026-07-22' },
  },
};

export default adapter;
