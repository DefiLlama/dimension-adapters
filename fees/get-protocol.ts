import { Adapter } from "../adapters/types";
import { CHAIN, POLYGON } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";

const protocolSubgraph =
  "https://api.thegraph.com/subgraphs/name/efesozen7/test-matic";

const tokenSubgraphPolygon =
  "https://api.thegraph.com/subgraphs/name/getprotocol/get-token-polygon";

const tokenSubgraphEthereum =
  "https://api.thegraph.com/subgraphs/name/getprotocol/get-token-ethereum";

const graphs = (
  graphUrl: string,
  tokenSubgraphEthereum: string,
  tokenSubgraphPolygon: string
) => {
  return async (timestamp: number) => {
    const beginningOfTheDay = getTimestampAtStartOfDayUTC(timestamp);
    const dateId = Math.floor(beginningOfTheDay / 86400);
    const block = await getBlock(beginningOfTheDay, CHAIN.POLYGON, {});

    const revenueQuery = gql`
      {
        protocolDay(id: ${dateId}) {
          reservedFuel
          reservedFuelProtocol
          treasuryRevenue
          holdersRevenue
        }
      }
    `;

    const feesQuery = gql`
      {
        stakingRewards(where: { blockTimestamp_gte: ${beginningOfTheDay}, blockTimestamp_lt: ${timestamp} }) {
          totalRewards
          type
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

    const graphRevenue = await request(graphUrl, revenueQuery);
    const graphPolyFees = await request(tokenSubgraphPolygon, feesQuery);
    const graphEthFees = await request(tokenSubgraphEthereum, feesQuery);
    const graphGETPrice = await request(graphUrl, graphQueryGETPrice);

    //GET Price in USD
    const getTokenPrice = parseFloat(graphGETPrice.priceOracle.price);

    const stakingFees = graphEthFees.stakingRewards
      .concat(graphPolyFees.stakingRewards)
      .filter((reward: any) => reward.type != "FUEL_DISTRIBUTION");

    const feesMinusIntegrator = stakingFees
      .map((reward: any) => BigInt(reward.totalRewards))
      .reduce(function (result: bigint, reward: bigint) {
        return result + reward;
      }, BigInt(0));

    const userFeesMinusIntegrator = stakingFees
      .filter((reward: any) => reward.type != "UNISWAP_LP_FEE")
      .map((reward: any) => BigInt(reward.totalRewards))
      .reduce(function (result: bigint, reward: bigint) {
        return result + reward;
      }, BigInt(0));

    //integrator fees in USD
    const integratorTicketingFeesUSD =
      parseFloat(graphRevenue.protocolDay.reservedFuel) * getTokenPrice;
    //daily fees w/o integrator fees
    const feesMinusIntegratorUSD =
      Number(feesMinusIntegrator / BigInt(10e18)) * getTokenPrice;
    //daily user fees w/o integrator fees
    const userFeesMinusIntegratorUSD =
      Number(userFeesMinusIntegrator / BigInt(10e18)) * getTokenPrice;

    const dailyFees = integratorTicketingFeesUSD + feesMinusIntegratorUSD;
    const dailyUserFees =
      integratorTicketingFeesUSD + userFeesMinusIntegratorUSD;
    const dailyHoldersRevenue =
      parseFloat(graphRevenue.protocolDay.holdersRevenue) * getTokenPrice;
    const dailyProtocolRevenue =
      parseFloat(graphRevenue.protocolDay.treasuryRevenue) * getTokenPrice;

    const dailyRevenue = dailyProtocolRevenue + dailyHoldersRevenue;

    return {
      timestamp,
      dailyFees: dailyFees.toString(),
      dailyUserFees: dailyUserFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      dailyHoldersRevenue: dailyHoldersRevenue.toString(),
      dailyProtocolRevenue: dailyProtocolRevenue.toString(),
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [POLYGON]: {
      fetch: graphs(
        protocolSubgraph,
        tokenSubgraphEthereum,
        tokenSubgraphPolygon
      ),
      start: async () => 1630468800,
      meta: {
        methodology:
          "Ticketeers pay an on-chain fee in GET for every ticket that they sell through GET Protocol",
      },
    },
  },
};

export default adapter;
