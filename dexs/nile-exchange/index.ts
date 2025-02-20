import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

<<<<<<< HEAD
const adapters = univ2Adapter({
  [CHAIN.LINEA]: "https://api.studio.thegraph.com/query/66247/nile-cl/version/latest/"
=======
const adapters = univ2Adapter2({
  [CHAIN.LINEA]: "https://graph-query.linea.build/subgraphs/name/nileexchange/cl-subgraph"
>>>>>>> a64e2d3e7fcc74d68f14ab6d1a88872780fca6d5
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.linea.start = 1705968000;
export default adapters;
