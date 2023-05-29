import { Adapter } from "../adapters/types";
import { CHAIN, POLYGON } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";

const endpoint =
  "https://api.thegraph.com/subgraphs/name/getprotocol/get-protocol-subgraph";

const graphs = (graphUrl: string) => {
  return async (timestamp: number) => {
    const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400)
    const dateIdIntegratorDay = "4-"+dateId
    const block = (await getBlock(timestamp, CHAIN.POLYGON, {}));
    const graphQueryFees = gql`
      {
        protocolDay(id: ${dateId}) {
          reservedFuel
          reservedFuelProtocol
        }
      }
    `;

    const graphQueryFeesAllTime = gql`
      {
        protocol(id: "1", block: { number: ${block} }) {
          reservedFuel
          reservedFuelProtocol
        }
      }
    `;
    const graphQueryGutsFees = gql`
      {
        integratorDay(id: "${dateIdIntegratorDay}") {
          reservedFuel
        }
      }
    `;
    const graphQueryGETPrice = gql`
      {
        priceOracle(id: "1", block: { number: ${block} }) {
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
    const finalDailyFee =
      parseFloat(graphRes.protocolDay.reservedFuel) * getPrice;

    const finalFeeAllTime =
      parseFloat(graphResAllTime.protocol.reservedFuel) * getPrice;

    //GUTS fees
    const gutsFeesDaily =
      parseFloat(graphGutsFees.integratorDay.reservedFuel) * getPrice;

    const dailyRevenue = (finalDailyFee - gutsFeesDaily) * 0.8;

    return {
      timestamp,
      totalFees: finalFeeAllTime.toString(),
      dailyFees: finalDailyFee.toString(),
      dailyProtocolRevenue: dailyRevenue.toString(),
      dailyRevenue: dailyRevenue.toString(),
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
