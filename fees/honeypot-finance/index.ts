import { getBuilderExports } from "../../helpers/orderly";

const methodology = {
  Fees: "Builder Fees collected from Orderly Network",
  Revenue: "All the fees collected",
  ProtocolRevenue: "All the revenue goes to the protocol",
};

const breakdownMethodology = {
  Fees: {
    "Builder fees": "Fees collected by Honeypot Finance as a builder on Orderly Network, earned from trading activity routed through their interface"
  },
  ProtocolRevenue: {
    "Builder fees": "100% of builder fees are retained by Honeypot Finance protocol"
  }
};

const adapter = getBuilderExports({ broker_id: "honeypot", start: "2025-11-01", methodology });
adapter.breakdownMethodology = breakdownMethodology;

export default adapter;
