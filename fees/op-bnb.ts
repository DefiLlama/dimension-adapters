import { CHAIN } from "../helpers/chains";
import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { fetchL2FeesWithDune } from '../helpers/ethereum-l2';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  return await fetchL2FeesWithDune(options, 'opbnb');
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OP_BNB],
  start: '2023-08-14',
  dependencies: [Dependencies.DUNE],
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true,
  allowNegativeValue: true, // L1 Costs
}

export default adapter;
