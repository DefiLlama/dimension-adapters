import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "alphaq",
  chains: [CHAIN.SOLANA],
  start: "2025-07-10",
});
