import { Adapter, ProtocolType } from "../adapters/types";
import { BSC } from "../helpers/chains";
import type { FetchOptions } from "../adapters/types"
import { fetchTransactionFees } from "../helpers/getChainFees";


async function fetch(_: any, _1: any, options: FetchOptions) {
  const dailyFees = await fetchTransactionFees(options)

  // https://github.com/bnb-chain/BEPs/blob/master/BEP95.md
  const dailyRevenue = options.toTimestamp < 1638234000 ? 0 : dailyFees.clone(0.1)

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
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
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users',
    Revenue: 'Amount of 10% BNB transaction fees that were burned',
    HoldersRevenue: 'Amount of 10% BNB transaction fees that were burned',
  }
}

export default adapter;
