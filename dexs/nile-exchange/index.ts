import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
  [CHAIN.LINEA]: "https://graph-query.linea.build/subgraphs/name/nileexchange/cl-subgraph"
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.linea.start = 1705968000;
export default adapters;
