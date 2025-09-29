import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import { gql, GraphQLClient } from "graphql-request";
import { Chain } from "../../adapters/types";

const headers = { 'sex-dev': 'ServerDev'}
type IEndPoints = {
  [c: string]: string;
}
const endpoints: IEndPoints = {
  [CHAIN.ZKFAIR]: 'https://gql.hyperionx.xyz/subgraphs/name/hyperionx/zkfair',
};

interface IResponse {
  today: Array<{
    totalVolume: string;
  }>;
  yesterday: Array<{
    totalVolume: string;
  }>;
}


const graphs = (chain: Chain) => {
  return async (timestamp: number) => {
    const toTimestamp = timestamp;
    const fromTimestamp = timestamp - 24 * 60 * 60;
    const toBlock = (await getBlock(toTimestamp, chain, {}));
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const query = gql`
      {
        today:protocolMetrics(block:{number:${toBlock}}, where: {id: "1"}){
          totalVolume
        },
        yesterday:protocolMetrics(block:{number:${fromBlock}}, where: {id: "1"}){
          totalVolume
        }
      }
    `;
    const graphQLClient = new GraphQLClient(endpoints[chain], {
      headers: headers,
    });

    const response: IResponse = await graphQLClient.request(query);
    const dailyVolume = (Number(response.today[0].totalVolume) - Number(response.yesterday[0].totalVolume)) / 10 ** 6;

      return {
        timestamp,
        dailyVolume: dailyVolume.toString(),
      };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ZKFAIR]: {
      fetch: graphs(CHAIN.ZKFAIR),
      start: '2024-01-31',
    },
  },
  deadFrom: '2024-10-31',
};

export default adapter;
