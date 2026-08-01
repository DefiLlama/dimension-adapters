import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume, fetchVolumeMove } from "./cyberperp";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    // [CHAIN.IOTAEVM]: {
    //   fetch: fetchVolume,
    //   start: '2024-07-23',
    // },
    [CHAIN.IOTA]: {
      fetch: fetchVolumeMove,
      start: '2025-10-23',
    },
  },
  methodology: {
    Volume:
      'Aggregated trade value of all positions opened and closed across all perpetual pairs',
  },
};
export default adapter;
