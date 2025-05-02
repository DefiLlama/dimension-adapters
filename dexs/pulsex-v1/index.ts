import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter2({
  [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex"
}, {
  factoriesName: "pulseXFactories",
});

adapter.adapter[CHAIN.PULSECHAIN].start = 1684566000; // 13/05/2023

// test: yarn test dexs pulsex-v1

export default adapter;
