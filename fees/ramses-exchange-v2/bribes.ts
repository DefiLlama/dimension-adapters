import request, { gql } from "graphql-request";
import { getPrices } from "../../utils/prices";
import { CHAIN } from "../../helpers/chains";

type TPrice = {
  [s: string]: {
    price: number;
    decimals: number;
  };
};

interface IBribes {
  amount: number;
  token: {
    id: string;
  };
}

export const fees_bribes = async (fromBlock: number, timestamp: number): Promise<number> => {
  try {
    const endpoint = 'https://api.thegraph.com/subgraphs/name/ramsesexchange/concentrated-liquidity-graph';
    const graphQuery = gql`
      query GetBribes($fromBlock: Int!) {
        bribes(
          where: { timestamp_gte: ${timestamp} }
        ) {
          amount
          token {
            id
          }
        }
      }
    `;

    const graphRes: { bribes: IBribes[] } = await request(endpoint, graphQuery, {
      fromBlock,
    });

    const logs_bribes = graphRes.bribes;

    const coins = [...new Set(logs_bribes.map((e: IBribes) => `${CHAIN.ARBITRUM}:${e.token.id.toLowerCase()}`))];
    const coins_split: string[][] = [];

    for (let i = 0; i < coins.length; i += 100) {
      coins_split.push(coins.slice(i, i + 100));
    }

    const prices_result: TPrice[] = await Promise.all(coins_split.map((a: string[]) => getPrices(a, timestamp)));
    const prices: TPrice = Object.assign({}, ...prices_result);

    const fees_bribes_usd = logs_bribes.map((e: IBribes) => {
      const price = prices[`${CHAIN.ARBITRUM}:${e.token.id.toLowerCase()}`]?.price || 0;
      const decimals = prices[`${CHAIN.ARBITRUM}:${e.token.id.toLowerCase()}`]?.decimals || 0;
      return (Number(e.amount)) * price;
    }).reduce((a: number, b: number) => a + b, 0);
    return fees_bribes_usd;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
