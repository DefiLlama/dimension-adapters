import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume } from "./wagmi";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    // [CHAIN.ERA]: {
    //   fetch: fetchVolume(CHAIN.ERA), error: "Wagmi does not exist on Era",
    //   start: '2023-04-12',
    // },
    [CHAIN.FANTOM]: {
      fetch: fetchVolume,
      start: "2023-04-12",
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchVolume,
    },
    [CHAIN.METIS]: {
      fetch: fetchVolume,
      start: "2023-12-18",
    },
    [CHAIN.KAVA]: {
      fetch: fetchVolume,
      start: "2023-09-12",
    },
    [CHAIN.SONIC]: {
      fetch: fetchVolume,
      start: "2024-09-12",
    },
  },
};
//
export default adapter;
