import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
  [CHAIN.METIS]: "https://metisapi.0xgraph.xyz/subgraphs/name/cryptoalgebra/analytics"
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.metis.start = 1698983690;
export default adapters;
