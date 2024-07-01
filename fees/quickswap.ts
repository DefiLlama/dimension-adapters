import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import { BreakdownAdapter, BaseAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import customBackfill from "../helpers/customBackfill";

import {
  getGraphDimensions
} from "../helpers/getUniSubgraph"

const v2Endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('FUWdkXWpi8JyhAnhKL5pZcVshpxuaUQG8JHMDqNCxjPd'),
}
const v2Graph = getGraphDimensions({
  graphUrls: v2Endpoints,
  feesPercent: {
    type: "volume",
    UserFees: 0.25,
    ProtocolRevenue: 0,
    SupplySideRevenue: 0.25,
    HoldersRevenue: 0.04,
    Revenue: 0.01,
    Fees: 0.3
  }
});

const v3Endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('CCFSaj7uS128wazXMdxdnbGA3YQnND9yBdHjPtvH7Bc7'),
  // // [CHAIN.DOGECHAIN]: "https://graph-node.dogechain.dog/subgraphs/name/quickswap/dogechain-info",
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/44554/quickswap-v3-02/version/latest",
  [CHAIN.XLAYER]: "https://api.studio.thegraph.com/query/44554/qs-xlayer-v3/version/latest",
  [CHAIN.MANTA]:"https://api.goldsky.com/api/public/project_clo2p14by0j082owzfjn47bag/subgraphs/quickswap/prod/gn",
  [CHAIN.ASTAR_ZKEVM]:"https://api.studio.thegraph.com/query/44554/astar-quickswap/version/latest",
  [CHAIN.IMX]: "https://api.goldsky.com/api/public/project_clo2p14by0j082owzfjn47bag/subgraphs/quickswap-IMX/prod/gn",
}

type TStartTime = {
  [s: string | Chain]: number;
}

const startTimeV3: TStartTime = {
  [CHAIN.POLYGON]: 1662425243,
  [CHAIN.POLYGON_ZKEVM]: 1679875200,
  [CHAIN.XLAYER]: 1712657439,
  [CHAIN.MANTA]: 1697690974,
  [CHAIN.ASTAR_ZKEVM]: 1709284529,
  [CHAIN.IMX]: 1702977793,
  // [CHAIN.DOGECHAIN]: 1660694400,
}

const v3Graphs = getGraphDimensions({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "algebraDayData",
    field: "volumeUSD",
    dateField: "date"
  },
  dailyFees: {
    factory: "algebraDayData",
    field: "feesUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Fees: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0 // Revenue is 100% of collected fees
  },
});

const v3Graphs1 = getGraphDimensions({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "volumeUSD",
    dateField: "date"
  },
  dailyFees: {
    factory: "uniswapDayData",
    field: "feesUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Fees: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0, // Revenue is 100% of collected fees
  },
});


const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  Fees: "A 0.3% of each swap is collected as trading fees",
  Revenue: "Protocol have no revenue",
  ProtocolRevenue: "Protocol have no revenue.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue.",
}

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.POLYGON]: {
        fetch: v2Graph(CHAIN.POLYGON),
        start: 1602118043,
        meta: {
          methodology
        },
      },
    },
    v3: {
      [CHAIN.POLYGON]: {
        fetch: v3Graphs(CHAIN.POLYGON),
        start: startTimeV3[CHAIN.POLYGON],
      },
      [CHAIN.POLYGON_ZKEVM]: {
        fetch: v3Graphs(CHAIN.POLYGON_ZKEVM),
        start: startTimeV3[CHAIN.POLYGON_ZKEVM],
      },
      [CHAIN.XLAYER]: {
        fetch: v3Graphs(CHAIN.XLAYER),
        start: startTimeV3[CHAIN.XLAYER],
      },
      [CHAIN.MANTA]: {
        fetch: v3Graphs1(CHAIN.MANTA),
        start: startTimeV3[CHAIN.MANTA],
      },
      [CHAIN.ASTAR_ZKEVM]: {
        fetch: v3Graphs1(CHAIN.ASTAR_ZKEVM),
        start: startTimeV3[CHAIN.ASTAR_ZKEVM],
      },
      [CHAIN.IMX]: {
        fetch: v3Graphs1(CHAIN.IMX),
        start: startTimeV3[CHAIN.IMX],
      },
    },
  }
}

export default adapter;
