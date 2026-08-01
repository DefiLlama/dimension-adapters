import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "pumpswap",
  chains: [CHAIN.SOLANA],
  start: "2025-02-20",
});
