import * as sdk from "@defillama/sdk";
import { Chain } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface IProtocolData {
  protocol: {
    totalTradeFee: number
  }
}

type IURL = {
  [l: string | Chain]: string;
};

const endpoints: IURL = {
  [CHAIN.CELO]: sdk.graph.modifyEndpoint('DGN3dMffNnXZRAHFyCAq3csJbe2o7g9Jdg2XHe2mzVdG'),
};

const fetch = (chain: Chain) => {
  return async ({ getFromBlock, getToBlock }: FetchOptions) => {
    const [fromBlock, toBlock] = await Promise.all([
      getFromBlock(), getToBlock()
    ])
    const graphQuery = gql`
    query query_total($block: Int) {
      protocol(
        id: "1"
        block: {
          number: $block
        }
      ) {
        totalTradeFee
      }
    }`;

    const [beforeRes, afterRes]: IProtocolData[] = await Promise.all([
       request(endpoints[chain], graphQuery, { block: fromBlock }),
       request(endpoints[chain], graphQuery, { block: toBlock }),
    ])
 
    const dailyFees = (afterRes.protocol.totalTradeFee - beforeRes.protocol.totalTradeFee) / 10 ** 18;

    return {
      dailyFees,
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.CELO]: {
      fetch: fetch(CHAIN.CELO),
      start: '2023-08-01',
    },
  },
  version: 2
};

export default adapter;
