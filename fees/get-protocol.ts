import { Adapter } from "../adapters/types";
import { POLYGON } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";

const PROTOCOL_SUBGRAPH = "https://api.thegraph.com/subgraphs/name/getprotocol/get-protocol-subgraph";
const TOKEN_SUBGRAPH_POLYGON = "https://api.thegraph.com/subgraphs/name/getprotocol/get-token-polygon";
const TOKEN_SUBGRAPH_ETHEREUM = "https://api.thegraph.com/subgraphs/name/getprotocol/get-token-ethereum";
const PRICE_ID = "coingecko:get-token";

const sumKeys = (keys: string[], obj: any) => keys.reduce((tally: number, key: string) => tally + (obj[key] || 0), 0);

const graphs = () => {
  return async (timestamp: number) => {
    const beginningOfDay = getTimestampAtStartOfDayUTC(timestamp);
    const dateId = Math.floor(beginningOfDay / 86400);

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
        stakingRewards(where: { blockTimestamp_gte: ${beginningOfDay}, blockTimestamp_lt: ${timestamp} }) {
          totalRewards
          type
        }
      }
    `;

    const graphRevenue = await request(PROTOCOL_SUBGRAPH, revenueQuery);
    const graphPolyFees = await request(TOKEN_SUBGRAPH_POLYGON, feesQuery);
    const graphEthFees = await request(TOKEN_SUBGRAPH_ETHEREUM, feesQuery);
    const getUSD = (await getPrices([PRICE_ID], beginningOfDay))[PRICE_ID].price;

    const integratorFees = parseFloat(graphRevenue.protocolDay.reservedFuel) * getUSD;
    const dailyHoldersRevenue = parseFloat(graphRevenue.protocolDay.holdersRevenue) * getUSD;
    const dailyProtocolRevenue = parseFloat(graphRevenue.protocolDay.treasuryRevenue) * getUSD;
    const dailyRevenue = dailyProtocolRevenue + dailyHoldersRevenue;

    // Transform staking rewards from both Polygon and Ethereum networks into an object indexed by the reward type.
    // The value of the each type will be the USD amount of GET rewarded using the price at that point in time.
    const stakingFees = graphEthFees.stakingRewards.concat(graphPolyFees.stakingRewards).reduce(
      (tally: any, reward: any) => ({
        [reward.type]: ((tally[reward.type] || 0) + Number(BigInt(reward.totalRewards) / BigInt(10e18))) * getUSD,
      }),
      {}
    );

    // dailyFees includes the Uniswap LP collected fees, the dailyUserFees does not.
    const dailyFees = integratorFees + sumKeys(["WITHDRAWAL_FEE", "REDISTRIBUTE", "UNISWAP_LP_FEE"], stakingFees);
    const dailyUserFees = integratorFees + sumKeys(["WITHDRAWAL_FEE", "REDISTRIBUTE"], stakingFees);

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
      fetch: graphs(),
      start: async () => 1630468800,
      meta: {
        methodology:
          "Ticketeers pay an on-chain fee in GET for every ticket that they sell through GET Protocol. Fees are determined by the amount deducted from users' balances when tickets are sold (fuel reserved) and revenue is collected when these tickets are checked-in, ending their lifecycle (fuel spent).",
      },
    },
  },
};

export default adapter;
