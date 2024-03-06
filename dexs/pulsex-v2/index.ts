import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2"
}, {
  factoriesName: "pulseXFactories",
  dayData: "pulsexDayData",
});

adapters.adapter.pulse.start = 1685577600;

export default adapters;
