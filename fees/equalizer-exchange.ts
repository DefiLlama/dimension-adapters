import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from '../helpers/solidly';

const VOTER_ADDRESS = '0xE3D1A117dF7DCaC2eB0AC8219341bAd92f18dAC1';
const FACTORY_ADDRESS = '0xc6366EFD0AF1d09171fe0EBF32c7943BB310832a';

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: getFeesExport({ VOTER_ADDRESS, FACTORY_ADDRESS }),
      start: '2022-12-09',
    },
    [CHAIN.SONIC]: {
      fetch: getFeesExport({ VOTER_ADDRESS: '0x17fa9dA6e01aD59513707F92033a6eb03CcB10B4', FACTORY_ADDRESS: '0xDDD9845Ba0D8f38d3045f804f67A1a8B9A528FcC' }),
    },
  }
};

export default adapter;
