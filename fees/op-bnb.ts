import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { fetchL2FeesWithDune } from '../helpers/ethereum-l2';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  return await fetchL2FeesWithDune(options, 'opbnb');
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.OP_BNB]: {
      fetch,
      start: '2023-08-14'
    },
  },
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true,
  allowNegativeValue: true, // L1 Costs
}

export default adapter;
