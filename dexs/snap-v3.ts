import { univ2Adapter2 } from "../helpers/getUniSubgraphVolume";
import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.TAC]: "https://api.goldsky.com/api/public/project_cltyhthusbmxp01s95k9l8a1u/subgraphs/cl-analytics-tac/v1.0.1/gn"
  },
  factoriesName: 'factories',
  totalFeesField: 'totalFeesUSD'
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TAC],
}

export default adapter
