import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "bisonfi",
  chains: [CHAIN.SOLANA],
  start: "2025-11-05",
});
