import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { fetchPoolFees } from "./launchy";

// These are Ekubo Core pool swap fees, already included in Ekubo's own fee
// listing. Keep them separate so Launchy's creation and router fees remain in
// non-double-counted chain and category totals.
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.STARKNET],
  start: "2026-09-18",
  fetch: fetchPoolFees,
  doublecounted: true,
  methodology: {
    Fees: "Swap fees generated in Launchy-created Ekubo pools. These fees are also reported by Ekubo.",
    Revenue: "Launchy's 30% share of guarded-pool swap fees. The original pool has no Launchy LP share.",
    ProtocolRevenue: "Launchy's share of guarded-pool fees allocated to its treasury.",
    SupplySideRevenue: "Creator and Ekubo shares of Launchy-created pool swap fees.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Ekubo pool swap fees estimated from on-chain input deltas and the pool fee rate.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Trading fees paid in Launchy-created Ekubo pools.",
    },
    Revenue: {
      "Launchy LP Fee Share": "30% of guarded-pool swap fees allocated to Launchy.",
    },
    ProtocolRevenue: {
      "Launchy LP Fee Share": "30% of guarded-pool swap fees allocated to Launchy.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "Creator portion of pool swap fees.",
      "Ekubo Fee Share": "Ekubo's 20% share of fees collected by Positions.",
    },
  },
};

export default adapter;
