import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter2({
  [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2"
}, {
  factoriesName: "pulseXFactories",
});

adapter.adapter[CHAIN.PULSECHAIN].start = 1685577600; // 25/05/2023

// test: yarn test dexs pulsex-v2

export default adapter;
