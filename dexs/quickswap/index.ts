import * as sdk from "@defillama/sdk";
import { BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { graphDimensionFetch } from "../../helpers/getUniSubgraph";
import {
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  getChainVolume,
} from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint(
    "FUWdkXWpi8JyhAnhKL5pZcVshpxuaUQG8JHMDqNCxjPd",
  ),
  [CHAIN.BASE]: "https://gateway.thegraph.com/api/eae8430c94c2403f46fee0fdfa5f1fd4/subgraphs/id/HtaMv1w1dCbk6RzsEsMjdcgeWZWeNqwATNbCZtKhFY49",
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
  [CHAIN.SONEIUM]:sdk.graph.modifyEndpoint("3GsT6AiuDiSzh2fXbFxUKtBxT8rBEGVdQCgHSsKMPHiu")
  };

const endpointsUniV3 = {
  [CHAIN.MANTA]:
    "https://api.goldsky.com/api/public/project_clo2p14by0j082owzfjn47bag/subgraphs/quickswap/prod/gn",
  [CHAIN.IMX]:
    "https://api.goldsky.com/api/public/project_clo2p14by0j082owzfjn47bag/subgraphs/quickswap-IMX/prod/gn",
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

const v3GraphsUni = graphDimensionFetch({
  graphUrls: endpointsUniV3,
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

const fetchLiquidityHub = async (_a: any) => {
  let dailyResult = await fetchURL(
    "https://hub.orbs.network/analytics-daily/v1",
  );

  let rows = dailyResult.result.rows;
  let lastDay = rows[rows.length - 1];
  let dailyVolume = lastDay.daily_total_calculated_value;
  let totalVolume = (await fetchURL(`https://hub.orbs.network/analytics/v1`))
    .result.rows[0].total_calculated_value;

  return {
    dailyVolume: dailyVolume,
  };
};

const QuickswapV3Factories: Record<string, string> = {
  [CHAIN.POLYGON]: '0x411b0fAcC3489691f28ad58c47006AF5E3Ab3A28',
  [CHAIN.POLYGON_ZKEVM]: '0x4B9f4d2435Ef65559567e5DbFC1BbB37abC43B57',
  [CHAIN.SONEIUM]: '0x8Ff309F68F6Caf77a78E9C20d2Af7Ed4bE2D7093',
}

async function getFetchUniV3LogAdapter(_a: any, _b: any, options: FetchOptions) {
  const adapter = getUniV3LogAdapter({ 
    factory: QuickswapV3Factories[options.chain], 
    poolCreatedEvent: 'event Pool (address indexed token0, address indexed token1, address pool)',
    swapEvent: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)',
    isAlgebraV2: true,
    userFeesRatio: 1,
    revenueRatio: 0,
    protocolRevenueRatio: 0,
    holdersRevenueRatio: 0,
  });
  
  return await adapter(options);
}

const adapter: BreakdownAdapter = {
  version: 1,
  breakdown: {
    v2: {
      [CHAIN.POLYGON]: {
        fetch: graphs(CHAIN.POLYGON),
        start: '2020-10-08',
      },
      [CHAIN.BASE]: {
        fetch: graphs(CHAIN.BASE),
        start: '2025-08-12',
      },
    },
    v3: {
      [CHAIN.POLYGON]: {
        fetch: getFetchUniV3LogAdapter,
        start: '2022-09-06',
      },
      // [CHAIN.DOGECHAIN]: {
      //   fetch: graphsV3(CHAIN.DOGECHAIN),
      //   start: '2022-08-17'
      // },
      [CHAIN.POLYGON_ZKEVM]: {
        fetch: getFetchUniV3LogAdapter,
        start: '2023-03-27',
      },
      [CHAIN.MANTA]: {
        fetch: v3GraphsUni,
        start: '2023-10-19',
      },
      [CHAIN.IMX]: {
        fetch: v3GraphsUni,
        start: '2023-12-19',
      },
      [CHAIN.SONEIUM]: {
        fetch: getFetchUniV3LogAdapter,
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
