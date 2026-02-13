import { getBuilderExports } from "../../helpers/orderly";
const methodology = {
  Fees: "Trading fees collected from Orderly Network",
  Revenue: "Revenue represents the portion of trading fees accrued to the Velto broker.",
  ProtocolRevenue: "All the revenue go to the protocol",
}
export default getBuilderExports({ broker_id: 'velto', start: '2025-11-25', methodology })