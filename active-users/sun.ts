import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "sunswap",
  chains: [CHAIN.TRON],
  start: "2021-12-14",
});
