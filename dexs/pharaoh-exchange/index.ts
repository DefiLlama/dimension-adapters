import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('oM4WnuyAbSwPpjk6niUkp88AZg1hSTi9aC1ZM4RcsqR')
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.avax.start = 1702339200;
export default adapters;
