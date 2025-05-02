import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType } from "../adapters/types";
import { L2FeesFetcher } from "../helpers/ethereum-l2";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SONEIUM]: {
      fetch: L2FeesFetcher({ ethereumWallets: [
        '0x6776BE80dBAda6A02B5F2095cF13734ac303B8d1'
      ] }),
      start: '2024-12-29',
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
