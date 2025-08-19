import ADDRESSES from '../helpers/coreAssets.json'
import * as sdk from "@defillama/sdk";
import { gql, GraphQLClient } from "graphql-request";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const query = (amo: string) => gql`
{
  amos(
    where: {
        id: "${amo.toLowerCase()}"
    }) {
    id
    name
    positions {
        depositAddress
        
      }
    }
  }
`;

const getGQLClient = (endpoint: string) => new GraphQLClient(endpoint);
const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResult> => {
  const { amos, graph, FRAX } = config[options.chain];
  const client = getGQLClient(graph);
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  for (const amo of amos) {
    const positions = (await client.request(query(amo))).amos[0].positions;
    const pairs = positions.map((item: any) => item.depositAddress);
    const events = await options.getLogs({
      targets: pairs,
      eventAbi: 'event AddInterest(uint256 interestEarned, uint256 rate, uint256 feesAmount, uint256 feesShare)',
      flatten: true,
    })
    for (const event of events) {
      dailyFees.add(FRAX, event.interestEarned)
      dailyProtocolRevenue.add(FRAX, event.feesAmount)
    }
  }

  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyProtocolRevenue)

  return {
    timestamp,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
  };
};

const config: {
  [chain: string]: { FRAX: string; amos: string[]; graph: string };
} = {
  [CHAIN.ETHEREUM]: {
    FRAX: ADDRESSES.ethereum.FRAX,
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
    FRAX: ADDRESSES.arbitrum.FRAX,
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
  methodology: {
    Fees: 'Total interest paid to users by borrowing FRAX.',
    Revenue: 'Total interest paid to users by borrowing FRAX.',
    ProtocolRevenue: 'Amount of interest collected by Frax Finance.',
    SupplySideRevenue: 'Amount of interest paid to lenders.',
  }
};

export default adapter;
