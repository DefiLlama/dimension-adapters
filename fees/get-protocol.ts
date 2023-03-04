import { Adapter } from "../adapters/types";
import { POLYGON } from "../helpers/chains";
import { request, gql } from "graphql-request";

const endpoint =
  "https://api.thegraph.com/subgraphs/name/getprotocol/get-protocol-subgraph";

const graphs = (graphUrl: string) => {
  return async (timestamp: number) => {
    const graphQueryFees = gql`
      {
        protocolDays(orderBy: day, orderDirection: desc, first: 1) {
          spentFuel
          spentFuelProtocol
        }
      }
    `;

    const graphQueryFeesAllTime = gql`
      {
        protocol(id: "1") {
          spentFuel
          spentFuelProtocol
        }
      }
    `;

    const graphRes = await request(graphUrl, graphQueryFees);
    const graphResAllTime = await request(graphUrl, graphQueryFeesAllTime);

    const finalDailyFee = parseInt(graphRes.protocolDays[0].spentFuel);
    const finalDailyRevenue = parseInt(
      graphRes.protocolDays[0].spentFuelProtocol
    );
    const finalFeeAllTime = parseInt(graphResAllTime.protocol.spentFuel);
    const finalRevenueAllTime = parseInt(
      graphResAllTime.protocol.spentFuelProtocol
    );

    return {
      timestamp,
      totalFees: finalFeeAllTime.toString(),
      dailyFees: finalDailyFee.toString(),
      totalProtocolRevenue: finalRevenueAllTime.toString(),
      dailyProtocolRevenue: finalDailyRevenue.toString(),
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [POLYGON]: {
      fetch: graphs(endpoint),
      start: async () => 1630468800,
      meta: {
        methodology:
          "Ticketeers pay an on-chain fee in GET for every ticket that they sell through GET Protocol",
      },
    },
  },
};

export default adapter;
