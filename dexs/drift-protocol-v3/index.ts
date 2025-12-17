import { CHAIN } from "../../helpers/chains";
import {
  BreakdownAdapter,
  Dependencies,
  FetchOptions,
} from "../../adapters/types";
import { prefetch, fetchDimensions } from "../../helpers/drift";

// Drift v3 launched December 4, 2025
// Uses the same program address as v2: dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: {
      [CHAIN.SOLANA]: {
        fetch: (_t: any, _tt: any, options: FetchOptions) =>
          fetchDimensions("spot", options),
        start: "2025-12-04",
      },
    },
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch: (_t: any, _tt: any, options: FetchOptions) =>
          fetchDimensions("perp", options),
        start: "2025-12-04",
      },
    },
  },
  prefetch,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
