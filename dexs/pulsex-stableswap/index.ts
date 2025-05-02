import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter2({
  [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/stableswap"
}, {
  factoriesName: "pulseXFactories",
});

adapter.adapter[CHAIN.PULSECHAIN].start = 1725367035; // 13/09/2024

// test: yarn test dexs pulsex-stableswap

export default adapter; 