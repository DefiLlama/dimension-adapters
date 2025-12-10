import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType, FetchOptions, Dependencies } from "../adapters/types";
import { fetchL2FeesWithDune } from "../helpers/ethereum-l2";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  return await fetchL2FeesWithDune(options);
}

const adapter: Adapter = {
  version: 1,
  chains: [CHAIN.ABSTRACT],
  fetch,
  start: '2024-10-25',
  protocolType: ProtocolType.CHAIN,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  allowNegativeValue: true, // L1 Costs
}

export default adapter;
