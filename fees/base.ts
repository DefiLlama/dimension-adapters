import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType, FetchOptions } from "../adapters/types";
import { fetchL2FeesWithDune } from "../helpers/ethereum-l2";

const ethereumWallets = [
  '0x5050F69a9786F081509234F1a7F4684b5E5b76C9',
  '0xff00000000000000000000000000000000008453',
  '0x642229f238fb9dE03374Be34B0eD8D9De80752c5',
  '0x56315b90c40730925ec5485cf004d835058518A0'
]

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  return fetchL2FeesWithDune(options, {
    chainName: 'base',
    ethereumWallets,
    blobSubmitterLabel: 'Base'
  });
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-06-23'
    },
  },
  protocolType: ProtocolType.CHAIN,
  allowNegativeValue: true, // calldata and blob costs
}

export default adapter;
