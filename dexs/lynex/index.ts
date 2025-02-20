import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
  [CHAIN.LINEA]: "https://api.studio.thegraph.com/query/59052/lynex-cl/v1.0.1"
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.linea.start = 1691394680;
export default adapters;
