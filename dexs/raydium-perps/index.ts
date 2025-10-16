import { getBuilderExports } from "../../helpers/orderly";

const methodology = {
  Fees: "Raydium charges no fee at the moment, there is 3 bps taker fees on orderly",
  Revenue: "No fee, so no revenue",
  ProtocolRevenue: "n/a",
}

export default getBuilderExports({ broker_id: 'raydium', start: '2024-12-11', methodology })