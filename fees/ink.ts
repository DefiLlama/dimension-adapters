import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType } from "../adapters/types";
import { L2FeesFetcher } from "../helpers/ethereum-l2";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.INK]: {
      // batch inbox from the superchain registry (rotation-proof, unlike the
      // genesis batcher EOA 0x500d7Ea6... this previously pointed at, which
      // stopped submitting and zeroed the revenue metric)
      fetch: L2FeesFetcher({ ethereumWallets: ['0x005969bf0EcbF6eDB6C47E5e94693b1C3651Be97'] }),
      start: '2024-12-20',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users',
    Revenue: 'Total revenue on Ink, calculated by subtracting the L1 Batch Costs from the total gas fees',
  }
}

export default adapter;
