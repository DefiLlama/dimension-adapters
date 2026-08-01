import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "solfi",
  chains: [CHAIN.SOLANA],
  start: "2024-10-29",
});
