import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter, } from "../../helpers/uniswap";
import { fetchVolume } from "./wagmi";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    // [CHAIN.ERA]: {
    //   fetch: fetchVolume(CHAIN.ERA), error: "Wagmi does not exist on Era",
    //   start: '2023-04-12',
    // },
    [CHAIN.FANTOM]: {
      fetch: getUniV3LogAdapter({ factory: '0xaf20f5f19698f1D19351028cd7103B63D30DE7d7', }),
      start: "2023-04-12",
    },
    [CHAIN.ETHEREUM]: {
      fetch: getUniV3LogAdapter({ factory: '0xB9a14EE1cd3417f3AcC988F61650895151abde24', }),
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
      start: "2023-12-18",
    },
  },
};
//
export default adapter;
