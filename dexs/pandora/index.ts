import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: "https://graphql.pandora.digital/subgraphs/name/pandora3"
}, {
  factoriesName: "pandoraFactories",
  dayData: "pandoraDayData",
});

adapters.adapter.bsc.start = 1652757593;
export default adapters;
