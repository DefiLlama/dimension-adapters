
import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType } from "../adapters/types";
import { L2FeesFetcher } from "../helpers/ethereum-l2";

const ethereumWallets = [
  '0x30c789674ad3b458886bbc9abf42eee19ea05c1d',
  '0xAEbA8e2307A22B6824a9a7a39f8b016C357Cd1Fe',
]

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.MANTA]: {
      fetch: L2FeesFetcher({ ethereumWallets }),
      start: '2023-09-09',
    },
  },
  protocolType: ProtocolType.CHAIN,
  allowNegativeValue: true, // sequencer fees
};

export default adapter;