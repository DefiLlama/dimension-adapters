import * as sdk from "@defillama/sdk";
import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import { DEFAULT_DAILY_VOLUME_FACTORY, DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL"

const endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('FUWdkXWpi8JyhAnhKL5pZcVshpxuaUQG8JHMDqNCxjPd'),
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});

const endpointsAlgebraV3 = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('CCFSaj7uS128wazXMdxdnbGA3YQnND9yBdHjPtvH7Bc7'),
  // [CHAIN.DOGECHAIN]: "https://graph-node.dogechain.dog/subgraphs/name/quickswap/dogechain-info",
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/44554/quickswap-v3-02/version/latest",
  [CHAIN.XLAYER]: "https://api.studio.thegraph.com/query/44554/qs-xlayer-v3/version/latest",
  [CHAIN.MANTA]:"https://api.goldsky.com/api/public/project_clo2p14by0j082owzfjn47bag/subgraphs/quickswap/prod/gn",
  [CHAIN.ASTAR_ZKEVM]:"https://api.studio.thegraph.com/query/44554/astar-quickswap/version/latest",
  [CHAIN.IMX]: "https://api.goldsky.com/api/public/project_clo2p14by0j082owzfjn47bag/subgraphs/quickswap-IMX/prod/gn",
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
    dateField: "date"
  },
  hasDailyVolume: true
});

const graphsAlgebraV3_1 = getChainVolume({
  graphUrls: endpointsAlgebraV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "volumeUSD",
  },
  hasDailyVolume: true
});

type TStartTime = {
  [s: string | CHAIN]: number;
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

const fetchLiquidityHub = async (timestamp: number) => {
    let dailyResult = (await fetchURL('https://hub.orbs.network/analytics-daily/v1'));
    let rows = dailyResult.result.rows;
    let lastDay = rows[rows.length - 1];
    let dailyVolume = lastDay.daily_total_calculated_value;
    let totalVolume = (await fetchURL(`https://hub.orbs.network/analytics/v1`)).result.rows[0].total_calculated_value;

    return {
        dailyVolume: `${dailyVolume}`,
        totalVolume: `${totalVolume}`,
        timestamp: timestamp,
    };
}

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.POLYGON]: {
        fetch: graphs(CHAIN.POLYGON),
        start: 1602118043
      },
    },
    v3: {
      [CHAIN.POLYGON]: {
        fetch: graphsAlgebraV3(CHAIN.POLYGON),
        start: startTimeV3[CHAIN.POLYGON]
      },
    //   // [CHAIN.DOGECHAIN]: {
    //   //   fetch: graphsV3(CHAIN.DOGECHAIN),
    //   //   start: 1660694400
    //   // },
      [CHAIN.POLYGON_ZKEVM]: {
        fetch: graphsAlgebraV3(CHAIN.POLYGON_ZKEVM),
        start: startTimeV3[CHAIN.POLYGON_ZKEVM]
      },
      [CHAIN.MANTA]: {
        fetch: graphsAlgebraV3_1(CHAIN.MANTA),
        start: startTimeV3[CHAIN.MANTA]
      },
      [CHAIN.ASTAR_ZKEVM]: {
        fetch: graphsAlgebraV3_1(CHAIN.ASTAR_ZKEVM),
        start: startTimeV3[CHAIN.ASTAR_ZKEVM]
      },
      [CHAIN.IMX]: {
        fetch: graphsAlgebraV3_1(CHAIN.IMX),
        start: startTimeV3[CHAIN.IMX]
      },
      [CHAIN.XLAYER]: {
        fetch: graphsAlgebraV3(CHAIN.XLAYER),
        start: startTimeV3[CHAIN.XLAYER]
      },
    },
    liquidityHub: {
      [CHAIN.POLYGON]: {
        fetch: fetchLiquidityHub,
        start: 1695042000
      },
    },
  },

};

export default adapter;
