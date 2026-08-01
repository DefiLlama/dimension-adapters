import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "scorch",
  chains: [CHAIN.SOLANA],
  start: "2026-02-19",
});
