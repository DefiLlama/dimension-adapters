import { Chain } from "../adapters/types";
import request from "graphql-request";
import { FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.METIS]: "https://metisapi.0xgraph.xyz/subgraphs/name/cryptoalgebra/analytics"
}

const fetch: FetchV2 = async (options) => {
  const { api, getStartBlock, getEndBlock, createBalances } = options
  const fromBlock = await getStartBlock()
  const toBlock = await getEndBlock()
  const graphQuery = (block: any) => `
      {
        factories(block: { number: ${block}}) {
          id
          totalFeesUSD
        }
      }
    `;

  const { factories: startRes }: any = await request(endpoints[api.chain], graphQuery(fromBlock))
  const { factories: endRes }: any = await request(endpoints[api.chain], graphQuery(toBlock))

  let dailyFees = endRes.reduce((acc: number, val: any) => acc + +val.totalFeesUSD, 0) - startRes.reduce((acc: number, val: any) => acc + +val.totalFeesUSD, 0)

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees * 0.15,
    dailyProtocolRevenue: dailyFees * 0.03,
    dailyHoldersRevenue: dailyFees * 0.12,
    dailySupplySideRevenue: dailyFees * 0.85,
  };
};

const adapter = { fetch, start: '2023-11-03', }


export default {
  adapter: {
    [CHAIN.METIS]: adapter,
  },
  version: 2,
};
