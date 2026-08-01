import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "project_x",
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-07-08",
});
