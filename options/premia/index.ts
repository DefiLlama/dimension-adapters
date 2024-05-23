import { CHAIN } from "../../helpers/chains"
import { BreakdownAdapter, ChainEndpoints } from "../../adapters/types"

import getV2Data from "./v2"
import getV3Data from "./v3"

const v2Endpoints: ChainEndpoints = {
  [CHAIN.ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/premiafinance/premiav2",
  [CHAIN.ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/premiafinance/premia-arbitrum",
  [CHAIN.FANTOM]:
    "https://api.thegraph.com/subgraphs/name/premiafinance/premia-fantom",
  [CHAIN.OPTIMISM]:
    "https://api.thegraph.com/subgraphs/name/premiafinance/premia-optimism",
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
          meta: {
            methodology: {
              UserFees:
                "Traders pay taker fees on each trade up to 3% of the option premium.",
              ProtocolRevenue: "The protocol collects 20% of the taker fees.",
              SupplySideRevenue:
                "Liquidity providers earn revenue from market-making options.",
              HoldersRevenue: "vxPREMIA holders collect 80% of the taker fees.",
            },
          },
        },
      }
    }, {}),

    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: async (ts: number) =>
            await getV3Data(v3Endpoints[chain], ts, chain),
          start: v3StartTimes[chain],
          meta: {
            methodology: {
              UserFees:
                "Traders pay taker fees on each trade up to 3% of the option premium.",
              ProtocolRevenue: "The protocol collects 10% of the taker fees.",
              SupplySideRevenue:
                "Liquidity providers collect 50% of the taker fees and earn revenue from market-making options.",
              HoldersRevenue: "vxPREMIA holders collect 40% of the taker fees.",
            },
          },
        },
      }
    }, {}),
  },
}

export default adapter
