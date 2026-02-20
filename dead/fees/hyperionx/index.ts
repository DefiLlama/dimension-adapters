import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
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
    totalFee: string;
  }>;
  yesterday: Array<{
    totalFee: string;
  }>;
}


const graphs = (chain: Chain) => {
  return async ({ getFromBlock, getToBlock }: FetchOptions) => {
    const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])
    
    const query = gql`
      {
        today:protocolMetrics(block:{number:${toBlock}}, where: {id: "1"}){
          totalFee
        },
        yesterday:protocolMetrics(block:{number:${fromBlock}}, where: {id: "1"}){
          totalFee
        }
      }
    `;
    const graphQLClient = new GraphQLClient(endpoints[chain], {
      headers: headers,
    });

    const response: IResponse = await graphQLClient.request(query);
    const dailyFees = (Number(response.today[0].totalFee) - Number(response.yesterday[0].totalFee)) / 10 ** 6;

      return {
        dailyFees,
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
  version: 2
};

export default adapter;
