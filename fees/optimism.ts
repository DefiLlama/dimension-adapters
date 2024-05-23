import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType } from "../adapters/types";
import { L2FeesFetcher } from "../helpers/ethereum-l2";

const ethereumWallets = [
  '0x6887246668a3b87F54DeB3b94Ba47a6f63F32985',
  '0xFF00000000000000000000000000000000000010',
  '0x473300df21D047806A082244b417f96b32f13A33',
  '0xdfe97868233d1aa22e815a266982f2cf17685a27'
]

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: L2FeesFetcher({ ethereumWallets }),
      start: 1598671449,
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
