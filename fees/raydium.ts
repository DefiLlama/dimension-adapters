import { BaseAdapter, Adapter } from "../adapters/types";
import volumeAdapter from "../dexs/raydium";
import { getDexChainFees } from "../helpers/getRaydiumFees";

const TOTAL_FEES = 0.0025;
const PROTOCOL_FEES = 0;

const feeAdapter: BaseAdapter = getDexChainFees({
  volumeAdapter,
  meta: {
    methodology: {
      Fees: "Total trading fees collected from users across all pool types.",
      Revenue: "Protocol's total revenue, derived from Treasury allocations and RAY buybacks.",
      UserFees: "Total fees paid by users. Varies by pool: 0.25% for AMM, variable tiers for CLMM/CPMM.",
      SupplySideRevenue: "Fees allocated to liquidity providers (88% for AMM, 84% for CLMM/CPMM).",
      HoldersRevenue: "Fees allocated to RAY token buybacks (12% across all pool types).",
      ProtocolRevenue: "Fees allocated to the Raydium Treasury (4% from CLMM/CPMM pools, 0% from AMM).",
    }
  }
});

const adapter: Adapter = {
  version: 2,
  adapter: feeAdapter
};

export default adapter;
