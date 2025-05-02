import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('NFHumrUD9wtBRnZnrvkQksZzKpic26uMM5RbZR56Gns')
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.avax.start = 1702339200;
export default adapters;
