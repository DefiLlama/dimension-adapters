import { BaseAdapter, BreakdownAdapter, IJSON } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph"

const v1Endpoints = {
  [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex",
}

const v2Endpoints = {
  [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2",
}

const stablesSwapEndpoints = {
  [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/stableswap",
}

const v1Graph = getGraphDimensions2({
  graphUrls: v1Endpoints,
  graphRequestHeaders: {
    [CHAIN.PULSECHAIN]: {
      "origin": "https://pulsex.com",
    },
  },
  totalVolume: {
    factory: "pulseXFactories"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.29, // Total fee: 0.29% on every swap
    UserFees: 0.29, // Users pay 0.29%
    SupplySideRevenue: 0, // 0% of the fee goes to liquidity providers, the only incentive is INC token emission
    ProtocolRevenue: 0.29 * 0.1439, // ~0.04% goes to an address which you can have no expectations (~14% of fee)
    HoldersRevenue: 0.29 * 0.8561, // ~0.25% goes to buy and burn PLSX (~86% of fee)
    Revenue: 0.29
  }
})

const v2Graph = getGraphDimensions2({
  graphUrls: v2Endpoints,
  graphRequestHeaders: {
    [CHAIN.PULSECHAIN]: {
      "origin": "https://pulsex.com",
    },
  },
  totalVolume: {
    factory: "pulseXFactories"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.29, // Total fee: 0.29% on every swap
    UserFees: 0.29, // Users pay 0.29%
    SupplySideRevenue: 0.22, // 0.22% goes to liquidity providers (~76% of fee)
    ProtocolRevenue: 0.07 * 0.1439, // 0.01% goes to an address which you can have no expectations (~4% of fee)
    HoldersRevenue: 0.07 * 0.8561, // 0.06% goes to buy and burn PLSX (~20% of fee)
    Revenue: 0.07
  }
})

const graphsStableSwap = getGraphDimensions2({
  graphUrls: stablesSwapEndpoints,
  totalVolume: {
    factory: "pulseXFactories"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.04, // Total fee: 0.04% on every swap
    UserFees: 0.04, // Users pay 0.04%
    SupplySideRevenue: 0.02, // 0.02% goes to liquidity providers (50% of fee)
    ProtocolRevenue: 0.02 * 0.1439, // 0.003% goes to an address which you can have no expectations (~7% of fee)
    HoldersRevenue: 0.02 * 0.8561, // 0.017% goes to buy and burn PLSX (43% of fee)
    Revenue: 0.02
  }
})

const v1StartTimes = {
  [CHAIN.PULSECHAIN]: 1684566000, // 13/05/2023
} as IJSON<number>

const v2StartTimes = {
  [CHAIN.PULSECHAIN]: 1685577600, // 25/05/2023
} as IJSON<number>

const stableTimes = {
  [CHAIN.PULSECHAIN]: 1725367035, // 13/09/2024
} as IJSON<number>

const v1Methodology = {
  UserFees: "User pays 0.29% fees on each swap.",
  ProtocolRevenue: "0.04% goes to an address which you can have no expectations (~14% of fees).",
  SupplySideRevenue: "LPs receive 0% of the fees. The only incentive is INC token emission.",
  HoldersRevenue: "0.25% (~86% of fees) is used to buy and burn PLSX.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const v2Methodology = {
  UserFees: "User pays 0.29% fees on each swap.",
  ProtocolRevenue: "0.01% goes to an address which you can have no expectations (~4% of fees).",
  SupplySideRevenue: "LPs receive 0.22% (~76% of fees).",
  HoldersRevenue: "0.06% (~20% of fees) is used to buy and burn PLSX.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const stableSwapMethodology = {
  UserFees: "User pays 0.04% fees on each stable swap.",
  ProtocolRevenue: "0.003% goes to an address which you can have no expectations (~7% of fees).",
  SupplySideRevenue: "LPs receive 0.02% (50% of fees).",
  HoldersRevenue: "0.017% (43% of fees) is used to buy and burn PLSX.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: Object.keys(v1Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v1Graph(chain),
        start: v1StartTimes[chain],
        meta: { methodology: v1Methodology }
      }
      return acc
    }, {} as BaseAdapter),
    v2: Object.keys(v2Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v2Graph(chain),
        start: v2StartTimes[chain],
        meta: { methodology: v2Methodology }
      }
      return acc
    }, {} as BaseAdapter),
    stableswap: Object.keys(stablesSwapEndpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: graphsStableSwap(chain),
        start: stableTimes[chain],
        meta: { methodology: stableSwapMethodology }
      }
      return acc
    }, {} as BaseAdapter),
  },
}

// test: yarn test protocols pulsex

export default adapter
