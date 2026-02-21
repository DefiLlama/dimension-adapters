import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2"
  },
  factoriesName: "pulseXFactories",
  feeConfig: {
    totalFees: 0.0029,
    protocolFees: 0.0007 * 0.1439,
    supplySideRevenue: 0.0022,
    holdersRevenue: 0.0007 * 0.8561,
    revenue: 0.0007,
    userFees: 0.0029,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.PULSECHAIN]: { fetch, },
  },
  start: '2023-05-25'
}

export default adapter;
