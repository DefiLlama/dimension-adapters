import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
  [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2"
}, {
  factoriesName: "pulseXFactories",
});

adapters.adapter.pulse.start = 1685577600;

export default adapters;
