import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, } from "graphql-request";
import type { ChainBlocks, ChainEndpoints, FetchOptions } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';

const endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/0xngmi/llamalend",
}
const ONE_DAY_IN_SECONDS = 60 * 60 * 24

interface IGraph {
  interest: string;
  borrowed: string;
}
const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number , _: ChainBlocks, { createBalances, getToBlock }: FetchOptions) => {
      const dailyFees = createBalances();
      const block = await getToBlock()
      const graphQuery = `
      {
        loans(where:{owner_not: null}, block:{ number: ${block}}) {
          interest
          borrowed
        }
      }
      `;

      const graphRes: IGraph[] = (await request(graphUrls[chain], graphQuery)).loans;
      graphRes.map((b: IGraph) => dailyFees.addGasToken((Number(b.interest) * Number(b.borrowed) * ONE_DAY_IN_SECONDS / 1e18)))

      return {
        timestamp: timestamp,
        dailyFees: dailyFees,
        dailyUserFees: dailyFees,
        dailySupplySideRevenue: dailyFees,
      };
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graphs(endpoints)(CHAIN.ETHEREUM),
      start: 1667260800,
      meta: {
        methodology: {
          Fees: "Interest paid by borrowers",
          UserFees: "Interest paid to borrow ETH",
          SupplySideRevenue: "Interest paid to NFTs lenders",
          Revenue: "Governance have no revenue",
          HoldersRevenue: "Token holders have no revenue",
          ProtocolRevenue: "Protocol have no revenue"
        }
      }
    },
  }
}

export default adapter;
