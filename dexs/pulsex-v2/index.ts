import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2"
  },
  factoriesName: "pulseXFactories",
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.PULSECHAIN]: { fetch, },
  },
  start: '2023-05-25'
}

export default adapter;
