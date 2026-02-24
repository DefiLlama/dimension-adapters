import request, { gql } from "graphql-request";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const fetch = async ({ getFromBlock, getToBlock }: FetchOptions): Promise<FetchResultV2> => {
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()]);

  const graphQuery = gql`query fees {
        today:balancers(block: { number: ${toBlock}}) { totalSwapFee totalSwapVolume totalProtocolFee }
        yesterday:balancers(block: { number: ${fromBlock}}) { totalSwapFee totalSwapVolume totalProtocolFee }
      }`;

  const graphRes: any = await request('https://api.goldsky.com/api/public/project_clq1h5ct0g4a201x18tfte5iv/subgraphs/bex-subgraph/mainnet-v1.0.1/gn', graphQuery);

  const totalVolume = graphRes.today.reduce((p, c) => p + c.totalSwapVolume, 0);
  const totalFees = graphRes.today.reduce((p, c) => p + c.totalSwapFee, 0);
  const totalProtocolFees = graphRes.today.reduce((p, c) => p + c.totalProtocolFee, 0);
  const previousVolume = graphRes.yesterday.reduce((p, c) => p + c.totalSwapVolume, 0);
  const previousFees = graphRes.yesterday.reduce((p, c) => p + c.totalSwapFee, 0);
  const previousProtocolFees = graphRes.yesterday.reduce((p, c) => p + c.totalProtocolFee, 0);

  const dailyVolume = totalVolume - previousVolume;
  const dailyFees = totalFees - previousFees;
  const dailyRevenue = totalProtocolFees - previousProtocolFees;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BERACHAIN]: { fetch, }
  },
};

export default adapter;
