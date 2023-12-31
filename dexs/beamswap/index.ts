import { gql, request } from "graphql-request";
import { BreakdownAdapter, ChainEndpoints, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import {
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions,
} from "../../helpers/getUniSubgraph";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: ChainEndpoints = {
  [CHAIN.MOONBEAN]:
    "https://api.thegraph.com/subgraphs/name/beamswap/beamswap-dex-v2",
};

const endpointsBeamex: ChainEndpoints = {
  [CHAIN.MOONBEAN]:
    "https://api.thegraph.com/subgraphs/name/flisko/stats-moonbeam",
};
const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      swap
    }
  }
`;

const historicalDataDerivatives = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      liquidation
      margin
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

const getFetch =
  (query: string) =>
  (chain: string): Fetch =>
  async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );
    const dailyData: IGraphResponse = await request(
      endpointsBeamex[chain],
      query,
      {
        id: String(dayTimestamp),
        period: "daily",
      }
    );
    const totalData: IGraphResponse = await request(
      endpointsBeamex[chain],
      query,
      {
        id: "total",
        period: "total",
      }
    );

    return {
      timestamp: dayTimestamp,
      dailyVolume:
        dailyData.volumeStats.length == 1
          ? String(
              Number(
                Object.values(dailyData.volumeStats[0]).reduce((sum, element) =>
                  String(Number(sum) + Number(element))
                )
              ) *
                10 ** -30
            )
          : undefined,
      totalVolume:
        totalData.volumeStats.length == 1
          ? String(
              Number(
                Object.values(totalData.volumeStats[0]).reduce((sum, element) =>
                  String(Number(sum) + Number(element))
                )
              ) *
                10 ** -30
            )
          : undefined,
    };
  };

const graphs = getGraphDimensions({
  graphUrls: endpoints,
  totalVolume: {
    factory: "uniswapFactories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "dailyVolumeUSD",
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    ProtocolRevenue: 0.13,
    SupplySideRevenue: 0.17,
    HoldersRevenue: 0,
    Revenue: 0.13,
    Fees: 0.3,
  },
});

const v1graphs = getGraphDimensions({
  graphUrls: {
    [CHAIN.MOONBEAN]:
      "https://api.thegraph.com/subgraphs/name/beamswap/beamswap-stable-amm",
  },
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
  dailyVolume: {
    factory: "dailyVolume",
    field: "volume",
    dateField: "timestamp",
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.04,
    ProtocolRevenue: 0.02,
    SupplySideRevenue: 0.02,
    HoldersRevenue: 0,
    Revenue: 0.02,
    Fees: 0.04,
  },
});

const endpointV3 = {
  [CHAIN.MOONBEAM]:
    "https://api.thegraph.com/subgraphs/name/beamswap/beamswap-v3",
};
const VOLUME_USD = "volumeUSD";
const v3Graphs = getGraphDimensions({
  graphUrls: endpointV3,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: VOLUME_USD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 16,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 84, // 84% of fees are going to LPs
    Revenue: 0,
  },
});

const methodology = {
  UserFees: "User pays 0.30% fees on each swap.",
  Fees: "A 0.30% of each swap is collected as trading fees",
  Revenue: "Protocol receives 0.13% on each swap.",
  ProtocolRevenue: "Protocol receives 0.13% on each swap.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Stakers received $GLINT in staking rewards.",
};

const methodologyv3 = {
  UserFees: "User pays 0.01%, 0.05%, 0.3%, or 1% on each swap.",
  ProtocolRevenue: "Protocol receives 16% of fees.",
  SupplySideRevenue: "84% of user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue.",
};
const methodologyStable = {
  UserFees: "User pays a 0.04% fee on each swap.",
  Fees: "A 0.04% of each swap is collected as trading fees",
  Revenue: "Protocol receives 0.02% of the swap fee",
  ProtocolRevenue: "Protocol receives 0.02% of the swap fee",
  SupplySideRevenue: "0.02% of the swap fee is distributed to LPs",
  HoldersRevenue: "Stakers received $GLINT in staking rewards.",
};

const methodologyBeamex = {
  Fees: "Fees from open/close position (0.2%), liquidations, swap (0.2% to 0.4%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.02%)",
  UserFees:
    "Fees from open/close position (0.2%), swap (0.2% to 0.4%) and borrow fee ((assets borrowed)/(total assets in pool)*0.04%)",
  HoldersRevenue:
    "30% of all collected fees are distributed to $stGLINT stakers",
  SupplySideRevenue:
    "70% of all collected fees will be distributed to BLP stakers. Currently they are distributed to treasury",
  Revenue: "70% of all collected fees are distributed to the treasury",
  ProtocolRevenue: "70% of all collected fees are distributed to the treasury",
};
const adapter: BreakdownAdapter = {
  breakdown: {
    classic: {
      [CHAIN.MOONBEAN]: {
        fetch: graphs(CHAIN.MOONBEAN),
        start: getStartTimestamp({
          endpoints,
          chain: CHAIN.MOONBEAN,
          dailyDataField: "uniswapDayDatas",
          dateField: "date",
          volumeField: "dailyVolumeUSD",
        }),
        meta: {
          methodology: {
            ...methodology,
          },
        },
      },
    },
    "stable-amm": {
      [CHAIN.MOONBEAN]: {
        fetch: v1graphs(CHAIN.MOONBEAN),
        start: async () => 1656914570,
        customBackfill: customBackfill(CHAIN.MOONBEAN, v1graphs),
        meta: {
          methodology: {
            ...methodologyStable,
          },
        },
      },
    },
    v3: {
      [CHAIN.MOONBEAN]: {
        fetch: v3Graphs(CHAIN.MOONBEAN),
        start: async () => 1684397388,
        customBackfill: customBackfill(CHAIN.MOONBEAN, v3Graphs),
        meta: {
          methodology: {
            ...methodologyv3,
          },
        },
      },
    },
    "beamex-swap": {
      [CHAIN.MOONBEAN]: {
        fetch: getFetch(historicalDataSwap)(CHAIN.MOONBEAN),
        start: async () => 1687421388,
        meta: {
          methodology: {
            ...methodologyBeamex,
          },
        },
      },
    },
    "beamex-perps": {
      [CHAIN.MOONBEAN]: {
        fetch: getFetch(historicalDataDerivatives)(CHAIN.MOONBEAN),
        start: async () => 1687421388,
        meta: {
          methodology: {
            ...methodologyBeamex,
          },
        },
      },
    },
  },
};

export default adapter;
