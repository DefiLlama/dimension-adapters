import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex"
  },
  factoriesName: "pulseXFactories",
  totalVolume: "totalVolumeUSD",
  feeConfig: {
    totalFees: 0.0029,
    protocolFees: 0.0029 * 0.1439,
    supplySideRevenue: 0,
    holdersRevenue: 0.0029 * 0.8561,
    revenue: 0.0029,
    userFees: 0.0029,
  },
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.PULSECHAIN],
  start: '2023-05-13'
}

export default adapter;
