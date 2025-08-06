import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.ZIRCUIT]:
      "https://api.goldsky.com/api/public/project_cltyhthusbmxp01s95k9l8a1u/subgraphs/ocelex-cl/1.0.0/gn",
  },
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ZIRCUIT],
  start: '2024-10-24'
}

export default adapter;
