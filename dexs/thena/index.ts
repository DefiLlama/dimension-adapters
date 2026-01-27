import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('FKEt2N5VmSdEYcz7fYLPvvnyEUkReQ7rvmXzs6tiKCz1')
  },
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: '2023-01-04'
}

export default adapter;
