import * as sdk from "@defillama/sdk";
import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import {
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  getChainVolume,
} from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint(
    "FUWdkXWpi8JyhAnhKL5pZcVshpxuaUQG8JHMDqNCxjPd",
  ),
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
    dateField: "date",
  },
  hasDailyVolume: true,
});

const endpointsAlgebraV3 = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint(
    "CCFSaj7uS128wazXMdxdnbGA3YQnND9yBdHjPtvH7Bc7",
  ),
  // [CHAIN.DOGECHAIN]: "https://graph-node.dogechain.dog/subgraphs/name/quickswap/dogechain-info",
  [CHAIN.POLYGON_ZKEVM]: sdk.graph.modifyEndpoint("3L5Y5brtgvzDoAFGaPs63xz27KdviCdzRuY12spLSBGU"),
  [CHAIN.MANTA]:
    "https://api.goldsky.com/api/public/project_clo2p14by0j082owzfjn47bag/subgraphs/quickswap/prod/gn",
  [CHAIN.SONEIUM]:
    "https://api.studio.thegraph.com/query/76874/integral-soneium/version/latest"
};

const endpointsUniV3 = {
  [CHAIN.MANTA]:
    "https://api.goldsky.com/api/public/project_clo2p14by0j082owzfjn47bag/subgraphs/quickswap/prod/gn",
  [CHAIN.ASTAR_ZKEVM]:
    "https://api.studio.thegraph.com/query/44554/astar-quickswap/version/latest",
};

const graphsAlgebraV3 = getChainVolume({
  graphUrls: endpointsAlgebraV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "algebraDayData",
    field: "volumeUSD",
    dateField: "date",
  },
});

const v3GraphsUni = getGraphDimensions({
  graphUrls: endpointsUniV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "volumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0, // Set revenue to 0 as protocol fee is not set for all pools for now
  },
});

const fetchLiquidityHub = async (timestamp: number) => {
  let dailyResult = await fetchURL(
    "https://hub.orbs.network/analytics-daily/v1",
  );

  let rows = dailyResult.result.rows;
  let lastDay = rows[rows.length - 1];
  let dailyVolume = lastDay.daily_total_calculated_value;
  let totalVolume = (await fetchURL(`https://hub.orbs.network/analytics/v1`))
    .result.rows[0].total_calculated_value;

  return {
    dailyVolume: `${dailyVolume}`,
    totalVolume: totalVolume ? `${totalVolume}` : undefined,
    timestamp: timestamp,
  };
};

const adapter: BreakdownAdapter = {
  version: 1,
  breakdown: {
    v2: {
      [CHAIN.POLYGON]: {
        fetch: graphs(CHAIN.POLYGON),
        start: '2020-10-08',
      },
    },
    v3: {
      [CHAIN.POLYGON]: {
        fetch: graphsAlgebraV3(CHAIN.POLYGON),
        start: '2022-09-06',
      },
      // [CHAIN.DOGECHAIN]: {
      //   fetch: graphsV3(CHAIN.DOGECHAIN),
      //   start: '2022-08-17'
      // },
      [CHAIN.POLYGON_ZKEVM]: {
        fetch: graphsAlgebraV3(CHAIN.POLYGON_ZKEVM),
        start: '2023-03-27',
      },
      [CHAIN.MANTA]: {
        fetch: v3GraphsUni(CHAIN.MANTA),
        start: '2023-10-19',
      },
      [CHAIN.SONEIUM]: {
        fetch: graphsAlgebraV3(CHAIN.SONEIUM),
        start: '2025-01-10',
      },
    },
    liquidityHub: {
      [CHAIN.POLYGON]: {
        fetch: fetchLiquidityHub,
        start: '2023-09-18',
      },
    },
  },
};

export default adapter;
