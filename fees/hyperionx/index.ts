import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import { gql, GraphQLClient } from "graphql-request";
import { Chain } from "@defillama/sdk/build/general";

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
  return async (timestamp: number): Promise<FetchResultFees> => {
    const toTimestamp = timestamp;
    const fromTimestamp = timestamp - 24 * 60 * 60;
    const toBlock = (await getBlock(toTimestamp, chain, {}));
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
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
    const totalFee = Number(response.today[0].totalFee) / 10 ** 6;

      return {
        timestamp,
        totalFees: totalFee.toString(),
        dailyFees: dailyFees.toString(),
      };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ZKFAIR]: {
      fetch: graphs(CHAIN.ZKFAIR),
      start: 1706659200,
    },
  },
};

export default adapter;
