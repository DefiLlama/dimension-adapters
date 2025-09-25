import { gql, request } from "graphql-request";
import { BreakdownAdapter, ChainEndpoints, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpointsBeamex: ChainEndpoints = {
  [CHAIN.MOONBEAM]:
    'https://graph.beamswap.io/subgraphs/name/beamswap/beamex-stats',
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

        return {
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
        };
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
}
const adapter: BreakdownAdapter = {
  methodology: methodologyBeamex,
  breakdown: {
    "beamex-swap": {
      [CHAIN.MOONBEAM]: {
        fetch: getFetch(historicalDataSwap)(CHAIN.MOONBEAM),
        start: '2023-06-22',
      },
    },
    "beamex-perps": {
      [CHAIN.MOONBEAM]: {
        fetch: getFetch(historicalDataDerivatives)(CHAIN.MOONBEAM),
        start: '2023-06-22',
      },
    },
  },
};

export default adapter;
