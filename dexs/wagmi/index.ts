import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume } from "./wagmi";

const adapter: SimpleAdapter = {
  version:2,
  adapter: {
    // [CHAIN.ERA]: {
    //   fetch: fetchVolume(CHAIN.ERA), error: "Wagmi does not exist on Era",
    //   start: 1681257600,
    // },
    [CHAIN.FANTOM]: {
      fetch: fetchVolume,
      start: 1681257600,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchVolume,
      start: 18240112,
    },
    // [CHAIN.METIS]: {
    //   fetch: fetchVolume(CHAIN.METIS),
    //   start: 1702888970,
    // },
    [CHAIN.KAVA]: {
      fetch: fetchVolume,
      start: 1694476800,
    },
  },
};
//
export default adapter;
