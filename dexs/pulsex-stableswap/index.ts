import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/stableswap"
  },
  factoriesName: "pulseXFactories",
  totalVolume: "totalVolumeUSD",
  feeConfig: {
    totalFees: 0.0004,
    protocolFees: 0.0002 * 0.1439,
    supplySideRevenue: 0.0002,
    holdersRevenue: 0.0002 * 0.8561,
    revenue: 0.0002,
    userFees: 0.0004,
  }
})

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.PULSECHAIN]: { fetch, }
  },
  start: '2024-09-13'
}

export default adapter; 