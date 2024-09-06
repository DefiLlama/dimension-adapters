import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('7mPnp1UqmefcCycB8umy4uUkTkFxMoHn1Y7ncBUscePp')
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.arbitrum.start = 1680220800;
export default adapters;
