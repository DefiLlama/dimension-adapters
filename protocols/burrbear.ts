import request, { gql } from "graphql-request";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

interface Balancer {
  totalSwapFee: number;
  totalSwapVolume: number;
  totalProtocolFee: number;
}

const fetch = async ({ getFromBlock, getToBlock }: FetchOptions): Promise<FetchResultV2> => {
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()]);

  const graphQuery = gql`query fees {
        today:balancers(block: { number: ${toBlock}}) { totalSwapFee totalSwapVolume totalProtocolFee }
        yesterday:balancers(block: { number: ${fromBlock}}) { totalSwapFee totalSwapVolume totalProtocolFee }
      }`;

  const graphRes: any = await request('https://api.goldsky.com/api/public/project_cluukfpdrw61a01xag6yihcuy/subgraphs/berachain/prod/gn', graphQuery);


  const totalVolume: number = graphRes.today.reduce((p: number, c: Balancer) => p + c.totalSwapVolume, 0);
  const totalFees = graphRes.today.reduce((p: number, c: Balancer) => p + c.totalSwapFee, 0);
  const totalProtocolFees = graphRes.today.reduce((p: number, c: Balancer) => p + c.totalProtocolFee, 0);
  const previousVolume = graphRes.yesterday.reduce((p: number, c: Balancer) => p + c.totalSwapVolume, 0);
  const previousFees = graphRes.yesterday.reduce((p: number, c: Balancer) => p + c.totalSwapFee, 0);
  const previousProtocolFees = graphRes.yesterday.reduce((p: number, c: Balancer) => p + c.totalProtocolFee, 0);

  const dailyVolume = totalVolume - previousVolume;
  const dailyFees = totalFees - previousFees;
  const dailyRevenue = totalProtocolFees - previousProtocolFees;

  return {
    dailyVolume,
    totalVolume,
    dailyFees,
    totalFees,
    dailyRevenue,
    totalRevenue: totalProtocolFees,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BERACHAIN]: { fetch, }
  },
};

export default adapter;