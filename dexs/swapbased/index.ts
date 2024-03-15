import customBackfill from "../../helpers/customBackfill";
import {
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
  getChainVolume,
} from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import type {
  Fetch,
  ChainEndpoints,
  BreakdownAdapter,
} from "../../adapters/types";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import request, { gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

// Subgraphs endpoints
const endpoints: ChainEndpoints = {
  [CHAIN.BASE]: "https://api.thegraph.com/subgraphs/name/chimpydev/swapbase",
};

// Fetch function to query the subgraphs
const graphs = getGraphDimensions({
  graphUrls: endpoints,
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    SupplySideRevenue: 0.25,
    ProtocolRevenue: 0.05,
    Revenue: 0.25,
    Fees: 0.3,
  },
});

const endpointsV3 = {
  [CHAIN.BASE]:
    "https://api.thegraph.com/subgraphs/name/chimpydev/swapbased-algebra-core",
};
const graphsV3 = getChainVolume({
  graphUrls: endpointsV3,
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

const methodology = {
  UserFees: "User pays 0.30% fees on each swap.",
  SupplySideRevenue: "LPs receive 0.25% of each swap.",
  ProtocolRevenue: "Treasury receives 0.05% of each swap.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user.",
};

/* PERPS */

const endpointsPerps: { [key: string]: string } = {
  [CHAIN.BASE]:
    "https://api.thegraph.com/subgraphs/name/chimpydev/swapbased-perps-core",
};

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      liquidation
      margin
    }
  }
`;

const historicalOI = gql`
  query get_trade_stats($period: String!, $id: String!) {
    tradingStats(where: { period: $period, id: $id }) {
      id
      longOpenInterest
      shortOpenInterest
    }
  }
`;

interface IGraphResponse {
  volumeStats: Array<{
    burn: string;
    liquidation: string;
    margin: string;
    mint: string;
    swap: string;
  }>;
}

interface IGraphResponseOI {
  tradingStats: Array<{
    id: string;
    longOpenInterest: string;
    shortOpenInterest: string;
  }>;
}

const getFetch =
  (query: string) =>
  (chain: string): any =>
  async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000),
    );
    const dailyData: IGraphResponse = await request(
      endpointsPerps[chain],
      query,
      {
        id: String(dayTimestamp) + ":daily",
        period: "daily",
      },
    );
    const totalData: IGraphResponse = await request(
      endpointsPerps[chain],
      query,
      {
        id: "total",
        period: "total",
      },
    );

    const tradingStats: IGraphResponseOI = await request(
      endpointsPerps[chain],
      historicalOI,
      {
        id: String(dayTimestamp) + ":daily",
        period: "daily",
      },
    );

    const dailyOpenInterest =
      Number(tradingStats.tradingStats[0]?.longOpenInterest || 0) +
      Number(tradingStats.tradingStats[0]?.shortOpenInterest || 0);
    const dailyLongOpenInterest = Number(
      tradingStats.tradingStats[0]?.longOpenInterest || 0,
    );
    const dailyShortOpenInterest = Number(
      tradingStats.tradingStats[0]?.shortOpenInterest || 0,
    );

    return {
      timestamp: dayTimestamp,
      dailyLongOpenInterest: dailyLongOpenInterest
        ? String(dailyLongOpenInterest * 10 ** -30)
        : undefined,
      dailyShortOpenInterest: dailyShortOpenInterest
        ? String(dailyShortOpenInterest * 10 ** -30)
        : undefined,
      dailyOpenInterest: dailyOpenInterest
        ? String(dailyOpenInterest * 10 ** -30)
        : undefined,
      dailyVolume:
        dailyData.volumeStats.length == 1
          ? String(
              Number(
                Object.values(dailyData.volumeStats[0]).reduce((sum, element) =>
                  String(Number(sum) + Number(element)),
                ),
              ) *
                10 ** -30,
            )
          : undefined,
      totalVolume:
        totalData.volumeStats.length == 1
          ? String(
              Number(
                Object.values(totalData.volumeStats[0]).reduce((sum, element) =>
                  String(Number(sum) + Number(element)),
                ),
              ) *
                10 ** -30,
            )
          : undefined,
    };
  };

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.BASE]: {
        fetch: graphs(CHAIN.BASE),
        start: 1690495200,
        customBackfill: customBackfill(CHAIN.BASE, graphs),
        meta: { methodology },
      },
    },
    v3: {
      [CHAIN.BASE]: {
        fetch: graphsV3(CHAIN.BASE),
        start: 1690443269,
      },
    },
    perps: {
      [CHAIN.BASE]: {
        fetch: getFetch(historicalDataSwap)(CHAIN.BASE),
        start: 1688913853,
      },
    },
  },
};

export default adapter;
