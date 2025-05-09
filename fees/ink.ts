import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType } from "../adapters/types";
import { L2FeesFetcher } from "../helpers/ethereum-l2";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.INK]: {
      fetch: L2FeesFetcher({ ethereumWallets: ['0x500d7Ea63CF2E501dadaA5feeC1FC19FE2Aa72Ac'] }),
      start: '2024-12-20',
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
