import request from "graphql-request";
import { Balances } from "@defillama/sdk";

interface IBribes {
  amount: number;
  token: {
    id: string;
    decimals: number;
  };
}

export const fees_bribes = async (fromBlock: number, timestamp: number, balances: Balances) => {
  const endpoint = 'https://api.thegraph.com/subgraphs/name/ramsesexchange/concentrated-liquidity-graph';
  const graphQuery = `
      query GetBribes($fromBlock: Int!) {
        bribes(
          where: { timestamp_gte: ${timestamp} }
        ) {
          amount
          token {
            id
            decimals
          }
        }
      }
    `;

  const graphRes: { bribes: IBribes[] } = await request(endpoint, graphQuery, { fromBlock, });

  const logs_bribes = graphRes.bribes;

  logs_bribes.map((e: IBribes) => {
    balances.add(e.token.id, e.amount * Math.pow(10, e.token.decimals));
  })
};
