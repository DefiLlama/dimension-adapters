import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains"
import { BreakdownAdapter, ChainEndpoints, FetchOptions } from "../../adapters/types"

import getV2Data from "./v2"
import getV3Data from "./v3"

const v2Endpoints: ChainEndpoints = {
  [CHAIN.ETHEREUM]:
    sdk.graph.modifyEndpoint('CqWfkgRsJRrQ5vWq9tkEr68F5nvbAg63ati5SVJQLjK8'),
  [CHAIN.ARBITRUM]:
    sdk.graph.modifyEndpoint('3o6rxHKuXZdy8jFifV99gMUe8FaVUL8w8bDTNdc4zyYg'),
  [CHAIN.FANTOM]:
    sdk.graph.modifyEndpoint('5ahtXN7DVTwnPuDhWqgJWvEeAEP3JD7h2kD1Kpe67VuW'),
  [CHAIN.OPTIMISM]:
    sdk.graph.modifyEndpoint('8wMexS8BB1cXWYu2V8cPHURGXSRGDBhshnU9nTiSkXQ7'),
}

const v2StartTimes: { [chain: string]: number } = {
  [CHAIN.ETHEREUM]: 1656201600,
  [CHAIN.ARBITRUM]: 1656201600,
  [CHAIN.FANTOM]: 1656201600,
  [CHAIN.OPTIMISM]: 1659744000,
}

const v3Endpoints: ChainEndpoints = {
  [CHAIN.ARBITRUM]:
    "https://subgraph.satsuma-prod.com/5d8f840fce6d/premia/premia-v3-arbitrum/api",
}

const v3StartTimes: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1692576000,
}

const adapter: BreakdownAdapter = {
  breakdown: {
    v2: Object.keys(v2Endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: async (ts: string) => await getV2Data(v2Endpoints[chain], ts),
          start: v2StartTimes[chain],
        },
      }
    }, {}),

    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: async (_ts: number, _t: any, options: FetchOptions) =>
            await getV3Data(v3Endpoints[chain], options.startOfDay, chain),
          start: v3StartTimes[chain],
        },
      }
    }, {}),
  },
}

export default adapter
