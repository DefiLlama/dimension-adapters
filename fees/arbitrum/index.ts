import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchL2FeesWithDune } from "../../helpers/ethereum-l2";

const arbitrumEthereumWallets = [
  '0x1c479675ad559dc151f6ec7ed3fbf8cee79582b6',
  '0x4c6f947Ae67F572afa4ae0730947DE7C874F95Ef',
  '0x51de512aa5dfb02143a91c6f772261623ae64564'
];

const fetchArbitrumFees = async (_a: any, _b: any, options: FetchOptions) => {
  return fetchL2FeesWithDune(options, {
    chainName: 'arbitrum',
    ethereumWallets: arbitrumEthereumWallets,
    blobSubmitterLabel: 'Arbitrum'
  });
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchArbitrumFees,
      start: '2021-08-10',
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  version: 1,
  allowNegativeValue: true, // arbitrum sequencer fees
}

export default adapter;