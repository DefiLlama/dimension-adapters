import { Adapter, ProtocolType } from "../adapters/types";
import { BSC } from "../helpers/chains";
import type { FetchOptions } from "../adapters/types"
import { fetchTransactionFees } from "../helpers/getChainFees";


async function fetch(_:any, _1:any, options: FetchOptions) {
  const dailyFees = await fetchTransactionFees(options)

  return {
    dailyFees,
    dailyRevenue: options.toTimestamp < 1638234000 ? 0: dailyFees.clone(0.1), // https://github.com/bnb-chain/BEPs/blob/master/BEP95.md
  };
}


const adapter: Adapter = {
  version: 1,
  adapter: {
    [BSC]: {
      fetch,
      start: '2020-08-29',
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
