import { getBuilderExports } from "../../helpers/orderly";

const methodology = {
  Fees: "Builder Fees collected from Orderly Network(0.3 bps on taker volume).",
  Revenue: "0.3 bps trading fees on taker volume, 0 on maker volume",
  ProtocolRevenue: "All the revenue go to the protocol",
}

export default getBuilderExports({ broker_id: 'aden', start: '2025-07-14', methodology });