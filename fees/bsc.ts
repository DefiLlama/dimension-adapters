import * as sdk from "@defillama/sdk";
import { Adapter, ProtocolType } from "../adapters/types";
import { BSC } from "../helpers/chains";
import type { ChainEndpoints, FetchOptions } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { fetchTransactionFees } from "../helpers/getChainFees";

const endpoints = {
  [BSC]: sdk.graph.modifyEndpoint('3a3f5kp31kutZzjmQoE2NKBSr6Ady5rgxRxD2nygYcQo')
}


const graphs = (_t: ChainEndpoints) => {
  return (_t: Chain) => {
    return async (options: FetchOptions) => {


      const dailyFees = await fetchTransactionFees(options)

      return {
        dailyFees,
        // totalFees: finalTotalFee.toString(),
        dailyRevenue: options.toTimestamp < 1638234000 ? 0: dailyFees.clone(0.1), // https://github.com/bnb-chain/BEPs/blob/master/BEP95.md
      };
    };
  };
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [BSC]: {
      fetch: graphs(endpoints)(BSC),
      start: '2020-08-29',
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
