import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType } from "../adapters/types";
import { L2FeesFetcher } from "../helpers/ethereum-l2";

const ethereumWallets = [
  '0x5050F69a9786F081509234F1a7F4684b5E5b76C9',
  '0xff00000000000000000000000000000000008453',
  '0x642229f238fb9dE03374Be34B0eD8D9De80752c5',
  '0x56315b90c40730925ec5485cf004d835058518A0'
]

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: L2FeesFetcher({ ethereumWallets }),
      start: 1687474800,
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
