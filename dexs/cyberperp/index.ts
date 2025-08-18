import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume } from "./cyberperp";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.IOTAEVM]: {
      fetch: fetchVolume,
      start: '2024-07-23',
    },
  },
};
export default adapter;
