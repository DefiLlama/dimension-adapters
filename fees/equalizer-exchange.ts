import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from '../helpers/solidly';

const VOTER_ADDRESS = '0xE3D1A117dF7DCaC2eB0AC8219341bAd92f18dAC1';
const FACTORY_ADDRESS = '0xc6366EFD0AF1d09171fe0EBF32c7943BB310832a';

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: getFeesExport({ VOTER_ADDRESS, FACTORY_ADDRESS }),
      start: 1670544000,
    },
  }
};

export default adapter;