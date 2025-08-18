import * as sdk from "@defillama/sdk";
import { Adapter, ChainBlocks, FetchOptions } from "../adapters/types";
import { POLYGON } from "../helpers/chains";
import { request, gql } from "graphql-request";

const PROTOCOL_SUBGRAPH = sdk.graph.modifyEndpoint('5CW9dVhyCBHhhxpaEwqtZrfGms3gSYnGQKpqULsu4qSU');
const TOKEN_SUBGRAPH_POLYGON = sdk.graph.modifyEndpoint('EjxRk3KsW58veQVZaeKNFk9G7qo56hTJh98bcFJEY5HS');
const TOKEN_SUBGRAPH_ETHEREUM = sdk.graph.modifyEndpoint('HGzbNN7tVyE3eT3uJbZuyMo9Vtf59uAGieLcNXvp94pA');
const PRICE_ID = "get-token";

const sumKeys = (keys: string[], obj: any) => keys.reduce((tally: number, key: string) => tally + (obj[key] || 0), 0);

const graphs = () => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, startOfDay, }: FetchOptions) => {
    const beginningOfDay = startOfDay;
    const dateId = Math.floor(beginningOfDay / 86400);

    const revenueQuery = `
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

    const dailyFees = createBalances()
    const dailyUserFees = createBalances()
    const dailyRevenue = createBalances()
    const dailyHoldersRevenue = createBalances()
    const dailyProtocolRevenue = createBalances()
    dailyFees.addCGToken(PRICE_ID, +graphRevenue.protocolDay.reservedFuel);
    dailyUserFees.addCGToken(PRICE_ID, +graphRevenue.protocolDay.reservedFuel);
    dailyHoldersRevenue.addCGToken(PRICE_ID, +graphRevenue.protocolDay.holdersRevenue);
    dailyProtocolRevenue.addCGToken(PRICE_ID, +graphRevenue.protocolDay.treasuryRevenue);
    dailyRevenue.addBalances(dailyHoldersRevenue)
    dailyRevenue.addBalances(dailyProtocolRevenue)


    // Transform staking rewards from both Polygon and Ethereum networks into an object indexed by the reward type.
    // The value of the each type will be the USD amount of GET rewarded using the price at that point in time.
    const stakingFees = graphEthFees.stakingRewards.concat(graphPolyFees.stakingRewards).reduce(
      (tally: any, reward: any) => ({
        [reward.type]: ((tally[reward.type] || 0) + Number(BigInt(reward.totalRewards) / BigInt(10e18))),
      }),
      {}
    );

    // dailyFees includes the Uniswap LP collected fees, the dailyUserFees does not.
    dailyFees.addCGToken('tether', +sumKeys(["WITHDRAWAL_FEE", "REDISTRIBUTE"], stakingFees));
    dailyUserFees.addCGToken('tether', +sumKeys(["WITHDRAWAL_FEE", "REDISTRIBUTE"], stakingFees));

    return {
      timestamp,
      dailyFees,
      dailyUserFees: dailyUserFees,
      dailyRevenue,
      dailyHoldersRevenue: dailyHoldersRevenue,
      dailyProtocolRevenue: dailyProtocolRevenue,
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [POLYGON]: {
      fetch: graphs(),
      start: '2021-09-01',
    },
  },
  methodology: {
    Fees: "Ticketeers pay an on-chain fee in GET for every ticket that they sell through GET Protocol. Fees are determined by the amount deducted from users' balances when tickets are sold (fuel reserved) and revenue is collected when these tickets are checked-in, ending their lifecycle (fuel spent).",
    Revenue: "Ticketeers pay an on-chain fee in GET for every ticket that they sell through GET Protocol. Fees are determined by the amount deducted from users' balances when tickets are sold (fuel reserved) and revenue is collected when these tickets are checked-in, ending their lifecycle (fuel spent).",
    HoldersRevenue: "Revenue distributed to token holders.",
  },
};

export default adapter;
