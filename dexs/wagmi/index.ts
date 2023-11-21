// import { CHAIN } from "../../helpers/chains";
// import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
// import { LINKS }  from './wagmi'
//
// const links = {
//   [CHAIN.ERA]: LINKS[CHAIN.ERA].subgraph,
//   [CHAIN.FANTOM]: LINKS[CHAIN.FANTOM].subgraph,
//   [CHAIN.KAVA]: LINKS[CHAIN.KAVA].subgraph,
// }
//
// const adapters = univ2Adapter(links, {
//   factoriesName: "factories",
//   dayData: "uniswapDayData",
//   dailyVolume: "volumeUSD",
//   totalVolume: "totalVolumeUSD",
// });
//
// adapters.adapter.era.start = async () => 1681257600;
// adapters.adapter.kava.start = async () => 1694476800;
// export default adapters;

import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume } from "./wagmi";

const adapter: SimpleAdapter = {
  adapter: {
    // [CHAIN.ERA]: {
    //   fetch: fetchVolume(CHAIN.ERA),
    //   start: async () => 1681257600,
    // },
    // [CHAIN.FANTOM]: {
    //   fetch: fetchVolume(CHAIN.FANTOM),
    //   start: async () => 1681257600,
    // },
    [CHAIN.KAVA]: {
      fetch: fetchVolume(CHAIN.KAVA),
      start: async () => 1694476800,
    },
  },
};
//
export default adapter;
