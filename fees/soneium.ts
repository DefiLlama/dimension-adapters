import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType } from "../adapters/types";
import { L2FeesFetcher } from "../helpers/ethereum-l2";

const ethereumWallets = [
  '0x4200000000000000000000000000000000000019',
  '0x420000000000000000000000000000000000001A',
  '0x4200000000000000000000000000000000000011'
]

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SONEIUM]: {
      fetch: L2FeesFetcher({ ethereumWallets }),
      start: '2024-12-29',
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
