import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchL2FeesWithDune } from "../../helpers/ethereum-l2";

// const arbitrumEthereumWallets = [
//   '0x1c479675ad559dc151f6ec7ed3fbf8cee79582b6',
//   '0x4c6f947Ae67F572afa4ae0730947DE7C874F95Ef',
//   '0x51de512aa5dfb02143a91c6f772261623ae64564'
// ];

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  return await fetchL2FeesWithDune(options);
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2021-08-10',
  dependencies: [Dependencies.DUNE],
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true,
  allowNegativeValue: true, // L1 Costs
}

export default adapter;