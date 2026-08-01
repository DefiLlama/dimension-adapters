import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType } from "../adapters/types";
import { L2FeesFetcher } from "../helpers/ethereum-l2";

const ethereumWallets = [
  '0x68bdfece01535090c8f3c27ec3b1ae97e83fa4aa',
  '0x4e31448a098393727b786e25b54e59dca1b77fe1',
  '0xB751A613f2Db932c6cdeF5048E6D2af05F9B98ED'
]

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.MINT]: {
      fetch: L2FeesFetcher({ ethereumWallets }),
      start: '2024-05-17',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users',
    Revenue: 'Total revenue on Mint, calculated by subtracting the L1 Batch Costs from the total gas fees',
  }
}

export default adapter;
