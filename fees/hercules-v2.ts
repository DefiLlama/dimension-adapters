import { Chain } from "../adapters/types";
import request from "graphql-request";
import { FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.METIS]: "https://metisapi.0xgraph.xyz/subgraphs/name/amm-subgraph-andromeda/"
}

const fetch: FetchV2 = async (options) => {
  const { api, getStartBlock, getEndBlock, createBalances } = options
  const fromBlock = await getStartBlock()
  const toBlock = await getEndBlock()
  const graphQuery = (block: any) => `
      {
        uniswapFactories(block: { number: ${block}}) {
          id
          totalFeeUSD
        }
      }
    `;

  const { uniswapFactories: startRes }: any = await request(endpoints[api.chain], graphQuery(fromBlock))
  const { uniswapFactories: endRes }: any = await request(endpoints[api.chain], graphQuery(toBlock))

  let dailyFees = endRes.reduce((acc: number, val: any) => acc + +val.totalFeeUSD, 0) - startRes.reduce((acc: number, val: any) => acc + +val.totalFeeUSD, 0)

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees * 0.4,
    dailyProtocolRevenue: dailyFees * 0.05,
    dailyHoldersRevenue: dailyFees * 0.35,
    dailySupplySideRevenue: dailyFees * 0.6,
  };
};

const adapter = { fetch, start: '2024-03-11', }


export default {
  adapter: {
    [CHAIN.METIS]: adapter,
  },
  version: 2,
};
