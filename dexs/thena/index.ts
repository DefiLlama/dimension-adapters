import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('FKEt2N5VmSdEYcz7fYLPvvnyEUkReQ7rvmXzs6tiKCz1')
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.bsc.start = 1672790400;
export default adapters;
