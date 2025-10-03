import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType, FetchOptions, Dependencies } from "../adapters/types";
import { fetchL2FeesWithDune } from "../helpers/ethereum-l2";

const ethereumWallets = [
  '0x6887246668a3b87F54DeB3b94Ba47a6f63F32985',
  '0xFF00000000000000000000000000000000000010',
  '0x473300df21D047806A082244b417f96b32f13A33',
  '0xdfe97868233d1aa22e815a266982f2cf17685a27'
];

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  return await fetchL2FeesWithDune(options);
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OPTIMISM],
  start: '2020-08-29',
  dependencies: [Dependencies.DUNE],
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true,
  allowNegativeValue: true, // calldata and blob costs
}

export default adapter;
