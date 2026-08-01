import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "fluid",
  chains: {
    [CHAIN.ETHEREUM]: "2024-10-29",
    [CHAIN.BASE]: "2025-02-14",
    [CHAIN.ARBITRUM]: "2024-12-19",
    [CHAIN.POLYGON]: "2025-04-02",
    [CHAIN.PLASMA]: "2025-09-24",
  },
  start: "2024-10-29",
});
