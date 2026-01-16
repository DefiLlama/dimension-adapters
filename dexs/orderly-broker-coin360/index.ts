import { getBuilderExports } from "../../helpers/orderly";

const methodology = {
  Volume: "Maker/taker volume that flow through the interface",
  Fees: "Builder Fees collected from Orderly Network",
  Revenue: "All the fees collected",
  ProtocolRevenue: "All the revenue goes to the protocol",
};

export default getBuilderExports({
  broker_id: "coin360",
  start: "2025-10-13",
  methodology,
});
