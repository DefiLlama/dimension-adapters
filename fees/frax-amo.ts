import * as sdk from "@defillama/sdk";
import { gql, GraphQLClient } from "graphql-request";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const query = (amo: string, timestamp: number) => gql`
{
    amos(
        where: {
            id: "${amo.toLowerCase()}"
        }) {
        id
        name
        positions {
            depositAddress
            name
            fraxAccountingPerDay(
                first: 3,
                orderBy: timestamp,
                orderDirection: desc
                where: {
                    timestamp_lt: ${timestamp}
                }) {
                balance
                depositedAmount
                profitTaken
                timestamp
                }
            }
        }
    }
`;

const getGQLClient = (endpoint: string) => new GraphQLClient(endpoint);

const findRevenue = (timedData: any) =>
  Number(timedData.balance) -
  Number(timedData.depositedAmount) +
  Number(timedData.profitTaken);

const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResult> => {
  const { amos, graph, FRAX } = config[options.chain];
  const client = getGQLClient(graph);
  const dailyRevenue = options.createBalances();
  const totalRevenue = options.createBalances();

  await Promise.all(
    amos.map(async (amo: string) => {
      const data = (await client.request(query(amo, timestamp))).amos[0];
      data.positions.map(({ fraxAccountingPerDay: days }: any) => {
        if (days.length < 2) return 
        const latest = findRevenue(days[0]);
        const previous = findRevenue(days[1]);
        dailyRevenue.add(FRAX, latest - previous);
        totalRevenue.add(FRAX, latest);
      });
    }),
  );

  return {
    timestamp,
    dailyRevenue,
    totalRevenue,
    dailyFees: dailyRevenue,
    totalFees: totalRevenue,
  };
};

const config: {
  [chain: string]: { FRAX: string; amos: string[]; graph: string };
} = {
  [CHAIN.ETHEREUM]: {
    FRAX: "0x853d955aCEf822Db058eb8505911ED77F175b99e",
    graph:
      sdk.graph.modifyEndpoint('5pkNZTvdKuik24p8xtHctfaHcmNghNqb4ANo2BfQVefZ'),
    amos: [
      // '0x49ee75278820f409ecd67063D8D717B38d66bd71', // curve
      // '0x629C473e0E698FD101496E5fbDA4bcB58DA78dC4', // twaamm
      // '0x452420df4AC1e3db5429b5FD629f3047482C543C', // fxb
      "0x0Ed8fA7FC63A8eb5487E7F87CAF1aB3914eA4eCa", // v1
      "0xf6E697e95D4008f81044337A749ECF4d15C30Ea6", // v3
    ],
  },
  [CHAIN.ARBITRUM]: {
    FRAX: "0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F",
    graph:
      sdk.graph.modifyEndpoint('4zJMfZFyGvqbKyyyeVs4qE15BaEuwr5DLLZiSLhJzBNs'),
    amos: [
      "0xCDeE1B853AD2E96921250775b7A60D6ff78fD8B4", // v3
    ],
  },
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(config).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
              },
    };
  }, {}),
  version: 1,
};

export default adapter;
