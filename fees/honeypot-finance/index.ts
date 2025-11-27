import { getBuilderExports } from "../../helpers/orderly";

const methodology = {
  Fees: "Builder Fees collected from Orderly Network",
  Revenue: "All the fees collected",
  ProtocolRevenue: "All the revenue goes to the protocol",
};

export default getBuilderExports({ broker_id: "honeypot", start: "2025-11-01", methodology })
