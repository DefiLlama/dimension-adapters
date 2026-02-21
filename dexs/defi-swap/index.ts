import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('G7W3G1JGcFbWseucNkHHvQorxyjQLEQt7vt9yPN97hri')
  },
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
  feeConfig: {
    totalFees: 0.003,
  }
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2021-09-21'
}

export default adapter;
