import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType } from "../adapters/types";
import { L2FeesFetcher } from "../helpers/ethereum-l2";

const ethereumWallets = [
  '0xfbd2541e316948b259264c02f370ed088e04c3db',
  '0xde7355c971a5b733fe2133753abd7e5441d441ec',
]

const adapter: Adapter = {
  adapter: {
    [CHAIN.BOBA]: {
      fetch: L2FeesFetcher({ ethereumWallets, }),
      start: 1664582400,
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;