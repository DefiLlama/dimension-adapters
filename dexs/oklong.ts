import { getBuilderExports } from "../helpers/orderly";

const methodology = {
  Fees: "Trading fees collected from Orderly Network",
  Revenue: "Revenue represents the portion of trading fees accrued to the Oklong broker.",
  ProtocolRevenue: "All the revenue go to the protocol",
}

export default getBuilderExports({ broker_id: 'oklong', start: '2025-10-22', methodology })
