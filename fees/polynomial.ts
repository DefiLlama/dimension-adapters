import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType } from "../adapters/types";
import { L2FeesFetcher } from "../helpers/ethereum-l2";

const ethereumWallets = [
  '0x5DA28F0186051a9F7b9eE2553FFdc165EB0A6714', // PROPOSER
  '0x67a44CE38627F46F20b1293960559eD85Dd194F1'  // BATCHER
];

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYNOMIAL]: {
      fetch: L2FeesFetcher({ ethereumWallets }),
      start: '2024-08-25',
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter; 