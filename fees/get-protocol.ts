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
          reservedFuel
          reservedFuelProtocol
        }
      }
    `;

    const graphQueryFeesAllTime = gql`
      {
        protocol(id: "1") {
          reservedFuel
          reservedFuelProtocol
        }
      }
    `;
    const graphQueryGutsFees = gql`
      {
        integratorDays(
          orderBy: day
          orderDirection: desc
          first: 1
          where: { integrator: "4" }
        ) {
          integrator {
            name
          }
          reservedFuel
        }
      }
    `;
    const graphQueryGETPrice = gql`
      {
        priceOracle(id: "1") {
          price
        }
      }
    `;
    const graphRes = await request(graphUrl, graphQueryFees);
    const graphResAllTime = await request(graphUrl, graphQueryFeesAllTime);
    const graphGutsFees = await request(graphUrl, graphQueryGutsFees);
    const graphGETPrice = await request(graphUrl, graphQueryGETPrice);

    //GET Price in USD
    const getPrice = parseFloat(graphGETPrice.priceOracle.price);

    //total fees
    const finalDailyFee = Math.trunc(
      parseFloat(graphRes.protocolDays[0].reservedFuel) * getPrice
    );
    const finalFeeAllTime = Math.trunc(
      parseFloat(graphResAllTime.protocol.reservedFuel) * getPrice
    );

    //GUTS fees
    const gutsFeesDaily = Math.trunc(
      parseFloat(graphGutsFees.integratorDays.reservedFuel) * getPrice
    );
    const dailyRevenue = Math.trunc((finalDailyFee - gutsFeesDaily) * 0.8);

    return {
      timestamp,
      totalFees: finalFeeAllTime.toString(),
      dailyFees: finalDailyFee.toString(),
      dailyProtocolRevenue: dailyRevenue.toString(),
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
